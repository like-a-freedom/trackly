import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:81';
const BACKEND = 'http://localhost:8080';
const OWNER_SESSION = process.env.E2E_SESSION_ID || ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16); }));
const OTHER_SESSION = '22222222-2222-2222-2222-222222222222';

let createdId: string | null = null;

test.afterEach(async ({ request }) => {
    if (createdId) {
        await request.delete(`${BACKEND}/api/tracks/${createdId}`, { data: { name: 'delete', session_id: OWNER_SESSION }, headers: { 'Content-Type': 'application/json' } }).catch(() => { });
        createdId = null;
    }
});

test('owner can edit description; non-owner cannot', async ({ page }) => {
    test.setTimeout(60_000);

    const uniqueName = `Owner Edit Test ${Date.now()}`;
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>${uniqueName}</name>\n    <trkseg>\n      <trkpt lat="37.7810" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="37.7815" lon="-122.4205"><ele>11</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;

    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle');

    // upload track as owner
    const { uploadTrack } = await import('./helpers/uploadWithRetries');
    const resp = await uploadTrack({ page, gpx, name: uniqueName, session: OWNER_SESSION, categories: 'owner' });

    if (!resp.ok || !resp.body || !resp.body.id) throw new Error('Failed to create track for edit test: ' + JSON.stringify(resp));
    createdId = resp.body.id;

    // Visit as owner and edit description
    await page.context().addCookies([{ name: 'session_id', value: OWNER_SESSION, domain: 'localhost', path: '/' }]);
    await page.addInitScript(sid => { try { localStorage.setItem('trackly_session_id', sid); } catch (e) { } }, OWNER_SESSION);

    // Wait for backend to have the new track available and associated with the owner session
    for (let i = 0; i < 10; i++) {
        const res = await page.evaluate(async (id) => {
            const r = await fetch(`/api/tracks/${id}`);
            if (!r.ok) return { ok: false };
            try { return { ok: true, body: await r.json() }; } catch (e) { return { ok: true, body: null }; }
        }, createdId);
        if (res && res.ok) break;
        await page.waitForTimeout(500);
    }

    await page.goto(`${FRONTEND}/track/${createdId}`);
    await page.waitForSelector('.edit-description-btn', { timeout: 20000 });

    const editBtn = page.locator('.edit-description-btn');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await page.waitForSelector('.edit-description-input', { timeout: 5000 });
    const input = page.locator('.edit-description-input');
    await input.fill('This is an E2E updated description');

    const saveBtn = page.locator('.save-btn');
    await saveBtn.click();

    // wait for description to be visible with updated text
    await page.waitForSelector('.track-description-text', { timeout: 5000 });
    await expect(page.locator('.track-description-text')).toContainText('E2E updated description');

    // Now view as non-owner and ensure edit button not visible
    await page.context().addCookies([{ name: 'session_id', value: OTHER_SESSION, domain: 'localhost', path: '/' }]);
    await page.addInitScript(() => { try { localStorage.setItem('trackly_session_id', '22222222-2222-2222-2222-222222222222'); } catch (e) { } });
    await page.goto(`${FRONTEND}/track/${createdId}`);
    await page.waitForLoadState('networkidle');

    const editBtnNonOwner = page.locator('.edit-description-btn');
    await expect(editBtnNonOwner).toHaveCount(0);
});