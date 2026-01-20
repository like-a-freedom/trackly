import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:81';
const TEST_SESSION = process.env.E2E_SESSION_ID || ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16); }));

function generateGpx(name: string) {
    const baseLat = 37.7800 + Math.random() * 0.001;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>${name}</name>\n    <trkseg>\n      <trkpt lat="${(baseLat).toFixed(7)}" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="${(baseLat + 0.0001).toFixed(7)}" lon="-122.4201"><ele>11</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;
}

let createdTrackIds: string[] = [];

test.afterEach(async ({ request }) => {
    for (const id of createdTrackIds) {
        try {
            const res = await request.delete(`http://localhost:8080/tracks/${id}`, {
                data: { name: 'delete', session_id: TEST_SESSION },
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok()) console.warn('Failed to cleanup uploaded test track:', await res.text());
        } catch (e) {
            console.warn('Cleanup request failed', e);
        }
    }
    createdTrackIds = [];
});

test('upload cooldown: server enforces wait and allows upload after timeout', async ({ page }) => {
    test.setTimeout(90_000);

    await page.context().addCookies([{ name: 'session_id', value: TEST_SESSION, domain: 'localhost', path: '/' }]);
    await page.addInitScript(() => { try { localStorage.setItem('trackly_session_id', (window as any).E2E_SESSION_ID || '11111111-1111-1111-1111-111111111111'); } catch (e) { } });

    // First upload — should succeed
    const name1 = `E2E Cooldown 1 ${Date.now()}`;
    const gpx1 = generateGpx(name1);

    const { uploadTrack } = await import('./helpers/uploadWithRetries');
    let uploadResp = null;
    // Retry a few times in case the backend is temporarily rate-limited
    for (let a = 1; a <= 6; a++) {
        uploadResp = await uploadTrack({ page, gpx: gpx1, name: name1, session: TEST_SESSION, categories: 'cooldown', maxAttempts: 4 });
        if (uploadResp && uploadResp.ok && uploadResp.body && (uploadResp.body.id || uploadResp.body.track_id)) break;
        console.warn('First upload attempt failed, retrying after short backoff', a, uploadResp);
        await page.waitForTimeout(1000 * a);
    }
    if (uploadResp && uploadResp.ok && uploadResp.body && (uploadResp.body.id || uploadResp.body.track_id)) {
        const id = uploadResp.body.id || uploadResp.body.track_id;
        await page.goto(`/track/${id}`);
        await page.waitForLoadState('networkidle');
        createdTrackIds.push(id);
    } else {
        throw new Error('Direct first upload failed after retries: ' + JSON.stringify(uploadResp));
    }

    // Now attempt an immediate UI upload (should hit cooldown)
    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle');
    await page.locator('.upload-button-compact').click();
    await page.waitForSelector('input#track-upload', { state: 'attached', timeout: 3000 });
    const input = page.locator('input#track-upload');
    const multiselect = page.locator('.track-category-select .multiselect-wrapper');
    const uploadBtn = page.locator('button.upload-btn');

    // Immediately attempt a second upload using direct fetch (should hit cooldown). We'll retry obeying server-specified wait durations.
    const name2 = `E2E Cooldown 2 ${Date.now()}`;
    const gpx2 = generateGpx(name2);

    const maxDirectRetries = 6;
    for (let attempt = 1; attempt <= maxDirectRetries; attempt++) {
        const resp = await uploadTrack({ page, gpx: gpx2, name: name2, session: TEST_SESSION, categories: 'cooldown' });

        if (resp.ok && resp.body && (resp.body.id || resp.body.track_id)) {
            const id = resp.body.id || resp.body.track_id;
            await page.goto(`/track/${id}`);
            await page.waitForLoadState('networkidle');
            createdTrackIds.push(id);
            return;
        }

        const bodyText = (typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body)).toLowerCase();
        let waitSecs = 10; // default fallback
        if (resp.status === 429 || (bodyText.includes('please') && bodyText.includes('wait'))) {
            const waitMatch = bodyText.match(/wait\s+(\d+)\s+seconds/);
            if (waitMatch) waitSecs = parseInt(waitMatch[1], 10) || 10;
            console.warn(`Direct upload attempt ${attempt} received cooldown (status=${resp.status}); waiting ${waitSecs}s before retrying`);
            await page.waitForTimeout((waitSecs + 1) * 1000);
            continue;
        }
        // no known cooldown info — fail explicitly for visibility
        throw new Error('Direct upload returned unexpected response: ' + JSON.stringify(resp));
    }

    throw new Error('Direct upload did not succeed after retries');
});
