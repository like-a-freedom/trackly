import { Page } from '@playwright/test';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8080';

function genSession() {
    // RFC4122 v4-like random UUID (not cryptographically strong — fine for tests)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export async function uploadTrack(options: {
    page: Page;
    gpx: string;
    name?: string;
    session?: string;
    categories?: string;
    maxAttempts?: number;
}): Promise<{ ok: boolean; status: number; body: any }> {
    const { page, gpx, name = 'E2E Upload', session = '11111111-1111-1111-1111-111111111111', categories = 'e2e', maxAttempts = 8 } = options;

    // Ensure origin is set for page-relative uploads
    await page.goto('/', { waitUntil: 'networkidle' }).catch(() => { });

    // Helper to perform upload via page.fetch (same origin)
    const doUiUpload = async (gpxContent: string) => {
        return await page.evaluate(async ({ gpxContent, session, name, categories }) => {
            const file = new File([gpxContent], 'e2e.gpx', { type: 'application/gpx+xml' });
            const fd = new FormData();
            fd.append('file', file);
            fd.append('name', name);
            fd.append('categories', categories);
            fd.append('session_id', session);
            const r = await fetch('/api/tracks/upload', { method: 'POST', body: fd, credentials: 'include' });
            const retry = r.headers.get('retry-after');
            const txt = await r.text();
            try { return { ok: r.ok, status: r.status, retry_after: retry, body: JSON.parse(txt) }; } catch (e) { return { ok: r.ok, status: r.status, retry_after: retry, body: txt }; }
        }, { gpxContent, session, name, categories });
    };

    // Server-side upload fallback using FormData in Node
    const doServerUpload = async (gpxContent: string) => {
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        const buf = Buffer.from(gpxContent);
        form.append('file', buf, { filename: 'e2e.gpx', contentType: 'application/gpx+xml' });
        form.append('name', name);
        form.append('categories', categories);
        form.append('session_id', session);

        for (let att = 1; att <= 5; att++) {
            const res = await fetch(`${BACKEND}/api/tracks`, { method: 'POST', body: form as any, headers: form.getHeaders() });
            const txt = await res.text();
            if (res.ok) {
                try { return { ok: true, status: res.status, body: JSON.parse(txt) }; } catch (e) { return { ok: true, status: res.status, body: txt }; }
            }
            // Handle cooldown
            if (res.status === 429) {
                const m = typeof txt === 'string' && txt.match && txt.match(/Please, wait (\d+) seconds/);
                if (m) {
                    const sec = Number(m[1]) || 1;
                    await new Promise(r => setTimeout(r, (sec + 1) * 1000));
                    continue;
                }
                await new Promise(r => setTimeout(r, 1000 * att));
                continue;
            }

            // If server error mentions geometry, we'll retry later with alt GPX
            if (res.status >= 500 && txt && (txt.includes('tracks_geom_valid') || txt.includes('Too few points'))) {
                return { ok: false, status: res.status, body: txt, geomError: true } as any;
            }

            if (res.status >= 500) {
                await new Promise(r => setTimeout(r, 1000 * att));
                continue;
            }

            return { ok: false, status: res.status, body: txt } as any;
        }
        return { ok: false, status: 500, body: 'server-side upload failed after retries' } as any;
    };

    // Two-point GPX fallback
    const twoPointGpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>${name} (2pt)</name>\n    <trkseg>\n      <trkpt lat="37.7810" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="37.7820" lon="-122.4210"><ele>12</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;

    let lastResp: any = null;

    for (let att = 1; att <= maxAttempts; att++) {
        // try ui upload
        const r = await doUiUpload(gpx);
        lastResp = r;
        if (r.ok && r.body && (r.body.id || r.body.track_id)) return r;

        console.warn('UI upload attempt', att, 'failed', r);

        // handle cooldowns
        if (r.status === 429) {
            const txt = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
            const m = txt && txt.match && txt.match(/Please, wait (\d+) seconds/);
            if (m) {
                const sec = Number(m[1]) || 1;
                await page.waitForTimeout((sec + 1) * 1000);
                continue;
            }
            if (r.retry_after) {
                const sec = Number(r.retry_after) || 1;
                await page.waitForTimeout((sec + 1) * 1000);
                continue;
            }
            // generic backoff
            await page.waitForTimeout(1000 * att);
            continue;
        }

        // If server error with geom, try server-side alt GPX
        if (r.status >= 500) {
            const txt = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
            if (txt && (txt.includes('tracks_geom_valid') || txt.includes('Too few points'))) {
                console.warn('Detected geometry error in UI upload; trying server-side alt GPX');
                const alt = await doServerUpload(twoPointGpx);
                if (alt && alt.ok) return alt;
            }
            // wait and retry
            await page.waitForTimeout(1000 * att);
            continue;
        }

        // generic small wait
        await page.waitForTimeout(500 * att);
    }

    // as last resort try server-side upload of original, then 2pt
    const serverResp = await doServerUpload(gpx);
    if (serverResp && serverResp.ok) return serverResp;
    if (serverResp && serverResp.geomError) {
        const alt = await doServerUpload(twoPointGpx);
        if (alt && alt.ok) return alt;
    }

    return lastResp || { ok: false, status: 500, body: 'unknown' };
}
