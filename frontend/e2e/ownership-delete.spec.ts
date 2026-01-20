import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:81';
const BACKEND = 'http://localhost:8080';
const OWNER_SESSION = process.env.E2E_SESSION_ID || ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16); }));

let createdId: string | null = null;

test.afterEach(async ({ request }) => {
    if (createdId) {
        await request.delete(`${BACKEND}/tracks/${createdId}`, { data: { name: 'delete', session_id: OWNER_SESSION }, headers: { 'Content-Type': 'application/json' } }).catch(() => { });
        createdId = null;
    }
});

test('owner can see delete button and delete track', async ({ page }) => {
    test.setTimeout(60_000);

    // Create a track via direct upload using owner session
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>Owner Delete Test</name>\n    <trkseg>\n      <trkpt lat="37.7810" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="37.7811" lon="-122.4201"><ele>11</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;

    // ensure page origin is set so fetch('/tracks/upload') resolves correctly
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle');

    const { uploadTrack } = await import('./helpers/uploadWithRetries');
    const resp = await uploadTrack({ page, gpx, name: 'Owner Delete Test', session: OWNER_SESSION, categories: 'owner' });

    if (!resp.ok || !resp.body || !resp.body.id) throw new Error('Failed to create track for owner test: ' + JSON.stringify(resp));
    createdId = resp.body.id;

    // Open the track page as owner
    await page.context().addCookies([{ name: 'session_id', value: OWNER_SESSION, domain: 'localhost', path: '/' }]);
    await page.addInitScript(sid => { try { localStorage.setItem('trackly_session_id', sid); } catch (e) { } }, OWNER_SESSION);

    for (let i = 0; i < 10; i++) {
        const res = await page.evaluate(async (id) => {
            const r = await fetch(`/tracks/${id}`);
            if (!r.ok) return { ok: false };
            try { return { ok: true, body: await r.json() }; } catch (e) { return { ok: true, body: null }; }
        }, createdId);
        if (res && res.ok) break;
        await page.waitForTimeout(500);
    }

    await page.goto(`${FRONTEND}/track/${createdId}`);
    await page.waitForSelector('.delete-track-btn', { timeout: 20000 });

    // Delete button visible for owner
    const delBtn = page.locator('.delete-track-btn');
    await expect(delBtn).toBeVisible();

    // Click delete -> confirm dialog appears
    await delBtn.click();
    await page.waitForSelector('.dialog-btn-confirm', { timeout: 5000 });
    await page.locator('.dialog-btn-confirm').click();

    // Wait for server to actually delete — poll the GET endpoint for 404
    for (let i = 0; i < 10; i++) {
        const r = await page.evaluate(async (id) => {
            const res = await fetch(`/tracks/${id}`);
            return { status: res.status };
        }, createdId);
        if (r.status === 404) {
            // Good — mark cleaned
            createdId = null;
            return;
        }
        await page.waitForTimeout(500);
    }

    throw new Error('Track was not deleted after confirm');
});