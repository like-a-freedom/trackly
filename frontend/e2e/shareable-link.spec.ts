import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:81';
const BACKEND = 'http://localhost:8080';
const OWNER_SESSION = process.env.E2E_SESSION_ID || ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16); }));

let createdId: string | null = null;

test.afterEach(async ({ request }) => {
    if (createdId) {
        await request.delete(`${BACKEND}/api/tracks/${createdId}`, { data: { name: 'delete', session_id: OWNER_SESSION }, headers: { 'Content-Type': 'application/json' } }).catch(() => { });
        createdId = null;
    }
});

test('public track can be viewed via shareable link without session', async ({ page }) => {
    test.setTimeout(60_000);

    const uniqueName = `Owner Share Test ${Date.now()}`;
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>${uniqueName}</name>\n    <trkseg>\n      <trkpt lat="37.7810" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="37.7820" lon="-122.4210"><ele>12</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;

    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle');

    const { uploadTrack } = await import('./helpers/uploadWithRetries');
    const resp = await uploadTrack({ page, gpx, name: uniqueName, session: OWNER_SESSION, categories: 'share' });

    if (!resp.ok || !resp.body || !resp.body.id) throw new Error('Failed to create track for share test: ' + JSON.stringify(resp));
    createdId = resp.body.id;

    // Open new context (no session) by clearing cookies
    const context = await (page.context().browser()!).newContext();
    const viewer = await context.newPage();
    await viewer.goto(`${FRONTEND}/track/${createdId}`);
    await viewer.waitForLoadState('networkidle');

    // Track name should be visible
    await viewer.waitForSelector('.track-name-block h2', { timeout: 10000 });
    await expect(viewer.locator('.track-name-block h2')).toContainText(uniqueName);

    // Edit and delete should not be visible for non-owner
    await expect(viewer.locator('.edit-description-btn')).toHaveCount(0);
    await expect(viewer.locator('.delete-track-btn')).toHaveCount(0);

    await context.close();
});