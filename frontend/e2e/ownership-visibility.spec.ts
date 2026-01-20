import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:81';
const BACKEND = 'http://localhost:8080';
const OWNER_SESSION = process.env.E2E_SESSION_ID || ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16); }));
const OTHER_SESSION = '22222222-2222-2222-2222-222222222222';

let createdId: string | null = null;

test.afterEach(async ({ request }) => {
    if (createdId) {
        await request.delete(`${BACKEND}/tracks/${createdId}`, { data: { name: 'delete', session_id: OWNER_SESSION }, headers: { 'Content-Type': 'application/json' } }).catch(() => { });
        createdId = null;
    }
});

test('non-owner cannot see owner controls (delete/edit)', async ({ page }) => {
    test.setTimeout(60_000);

    // Create track as owner (use at least 2 points to produce valid LINESTRING)
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>Ownership Visibility Test</name>\n    <trkseg>\n      <trkpt lat="37.7810" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="37.7820" lon="-122.4210"><ele>12</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;

    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle');

    const { uploadTrack } = await import('./helpers/uploadWithRetries');
    const resp = await uploadTrack({ page, gpx, name: 'Ownership Visibility Test', session: OWNER_SESSION, categories: 'vis' });

    if (!resp || !resp.ok || !resp.body || !resp.body.id) {
        // fallback: try server-side upload using node FormData
        try {
            const FormData = (await import('form-data')).default;
            const gpxBuffer = Buffer.from(gpx);
            const form = new FormData();
            form.append('file', gpxBuffer, { filename: 'owner-vis.gpx', contentType: 'application/gpx+xml' });
            form.append('name', 'Ownership Visibility Test');
            form.append('categories', 'vis');
            form.append('session_id', OWNER_SESSION);

            let created = null;
            const gpxTwoPoints = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>Ownership Visibility Test (2pt)</name>\n    <trkseg>\n      <trkpt lat="37.7810" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="37.7820" lon="-122.4210"><ele>12</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;

            for (let att = 1; att <= 5; att++) {
                const res = await fetch(`${BACKEND}/tracks`, { method: 'POST', body: form as any, headers: form.getHeaders() });
                const txt = await res.text();
                if (!res.ok) {
                    console.warn('server-side upload attempt', att, 'failed', res.status, txt);
                    // if server says to wait
                    if (res.status === 429) {
                        const m = txt && txt.match && txt.match(/Please, wait (\d+) seconds/);
                        if (m) {
                            await new Promise(r => setTimeout(r, (Number(m[1]) + 1) * 1000));
                            continue;
                        }
                        await new Promise(r => setTimeout(r, 1000 * att));
                        continue;
                    }

                    // If DB constraint about geometry is violated (too few points), retry with 2-point GPX
                    if (res.status >= 500 && txt && (txt.includes('tracks_geom_valid') || txt.includes('Too few points'))) {
                        console.warn('Detected geometry validation error, retrying with 2-point GPX');
                        const gpxBuf = Buffer.from(gpxTwoPoints);
                        const altForm = new FormData();
                        altForm.append('file', gpxBuf, { filename: 'owner-vis-2pt.gpx', contentType: 'application/gpx+xml' });
                        altForm.append('name', 'Ownership Visibility Test (2pt)');
                        altForm.append('categories', 'vis');
                        altForm.append('session_id', OWNER_SESSION);
                        // attempt alt upload
                        const res2 = await fetch(`${BACKEND}/tracks`, { method: 'POST', body: altForm as any, headers: altForm.getHeaders() });
                        const txt2 = await res2.text();
                        if (res2.ok) {
                            created = JSON.parse(txt2);
                            break;
                        }
                        console.warn('Alt upload attempt failed', res2.status, txt2);
                        await new Promise(r => setTimeout(r, 1000 * att));
                        continue;
                    }

                    if (res.status >= 500) {
                        await new Promise(r => setTimeout(r, 1000 * att));
                        continue;
                    }
                    throw new Error(`Server-side upload failed: ${res.status} ${txt}`);
                }
                created = JSON.parse(txt);
                if (created && (created.id || created.track_id)) break;
            }
            if (!created) throw new Error('Server-side upload failed after retries');
            createdId = created.id || created.track_id;
        } catch (err) {
            throw new Error('Failed to create track for visibility test: ' + JSON.stringify(resp) + ' and fallback upload error: ' + String(err));
        }
    } else {
        createdId = resp!.body.id;
    }

    // Visit as non-owner (different session id)
    await page.context().addCookies([{ name: 'session_id', value: OTHER_SESSION, domain: 'localhost', path: '/' }]);
    await page.addInitScript(() => { try { localStorage.setItem('trackly_session_id', '22222222-2222-2222-2222-222222222222'); } catch (e) { } });

    await page.goto(`${FRONTEND}/track/${createdId}`);
    await page.waitForLoadState('networkidle');

    // Delete button should not exist
    const delBtn = page.locator('.delete-track-btn');
    await expect(delBtn).toHaveCount(0);

    // Edit description button should not be visible
    const editDesc = page.locator('.edit-description-btn');
    await expect(editDesc).toHaveCount(0);
});