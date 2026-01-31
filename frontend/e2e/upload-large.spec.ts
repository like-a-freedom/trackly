import { test, expect } from '@playwright/test';

const TEST_SESSION = process.env.E2E_SESSION_ID || '11111111-1111-1111-1111-111111111111';
const BACKEND_BASE = 'http://localhost:8080';

function generateLargeGpx(points = 2000) {
    const baseLat = 37.78;
    const segments = new Array(points).fill(0).map((_, i) => `<trkpt lat="${(baseLat + i * 0.00001).toFixed(7)}" lon="-122.4200"><ele>${(10 + (i % 100))}</ele></trkpt>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>Large GPX Test</name>\n    <trkseg>\n${segments}\n    </trkseg>\n  </trk>\n</gpx>`;
}

let created: string | null = null;

test.afterEach(async ({ request }) => {
    if (created) {
        await request.delete(`${BACKEND_BASE}/api/tracks/${created}`, { data: { name: 'delete', session_id: TEST_SESSION }, headers: { 'Content-Type': 'application/json' } }).catch(() => { });
        created = null;
    }
});

test('large gpx upload either succeeds or returns explicit error', async ({ page }) => {
    test.setTimeout(120_000);
    await page.context().addCookies([{ name: 'session_id', value: TEST_SESSION, domain: 'localhost', path: '/' }]);
    await page.addInitScript(() => { try { localStorage.setItem('trackly_session_id', (window as any).E2E_SESSION_ID || '11111111-1111-1111-1111-111111111111'); } catch (e) { } });

    const gpx = generateLargeGpx(1500);

    // Ensure page origin is set so fetch('/api/tracks/upload') resolves relative to frontend
    await page.goto('http://localhost:81');
    await page.waitForLoadState('networkidle');

    const { uploadTrack } = await import('./helpers/uploadWithRetries');
    const resp = await uploadTrack({ page, gpx, name: 'Large GPX Test', session: TEST_SESSION, categories: 'large-test' });

    if (resp.ok && resp.body && resp.body.id) {
        // success path
        created = resp.body.id;
        await page.goto(`/track/${created}`);
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain(`/track/${created}`);
    } else {
        // expect that server returns explicit error like 413 or 503 or a message saying upload too large
        const txt = typeof resp.body === 'string' ? resp.body.toLowerCase() : JSON.stringify(resp.body);
        // Accept explicit large-file errors OR server rate-limit (429) because environment may throttle
        expect(resp.status === 413 || resp.status === 503 || resp.status === 429 || txt.includes('size') || txt.includes('large') || txt.includes('too') || txt.includes('limit')).toBeTruthy();
    }
});