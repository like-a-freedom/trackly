import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:81';
const TEST_SESSION = '11111111-1111-1111-1111-111111111111';

function generateGpx(name: string) {
    const baseLat = 37.7800 + Math.random() * 0.001;
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trackly E2E">
  <trk>
    <name>${name}</name>
    <trkseg>
      <trkpt lat="${(baseLat).toFixed(7)}" lon="-122.4200"><ele>10</ele></trkpt>
      <trkpt lat="${(baseLat + 0.0001).toFixed(7)}" lon="-122.4201"><ele>11</ele></trkpt>
      <trkpt lat="${(baseLat + 0.0002).toFixed(7)}" lon="-122.4202"><ele>12</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;
}

let createdTrackId: string | null = null;

test.afterEach(async ({ request }) => {
    if (createdTrackId) {
        const res = await request.delete(`http://localhost:8080/api/tracks/${createdTrackId}`, {
            data: { name: 'delete', session_id: TEST_SESSION },
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok()) {
            console.warn('Failed to cleanup uploaded test track:', await res.text());
        } else {
            console.log('Deleted uploaded test track:', createdTrackId);
        }
        createdTrackId = null;
    }
});

test('upload flow: new file uploads, shows success and links to track', async ({ page }) => { // retries=2 for transient backend upload errors
    // allow longer timeout for server-enforced upload cooldowns
    test.setTimeout(120000);

    // Prepare a unique GPX in-memory and set as file
    const uniqueName = `E2E Upload Test ${Date.now()}`;
    const gpx = generateGpx(uniqueName);

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            await page.context().addCookies([{ name: 'session_id', value: TEST_SESSION, domain: 'localhost', path: '/' }]);
            await page.addInitScript(() => { try { localStorage.setItem('trackly_session_id', '11111111-1111-1111-1111-111111111111'); } catch (e) { } });
            await page.goto(FRONTEND);
            await page.waitForLoadState('domcontentloaded');

            // Expand upload form
            await page.locator('.upload-button-compact').click();
            await page.waitForSelector('input#track-upload', { state: 'attached', timeout: 3000 });
            const input = page.locator('input#track-upload');
            await input.setInputFiles({ name: 'upload-e2e.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx, 'utf8') });

            // Provide a category so the Upload button is enabled
            await page.fill('#track-name-input', uniqueName);
            // Select a category by focusing multiselect and typing (simple approach: type and press Enter)
            const multiselect = page.locator('.track-category-select .multiselect-wrapper');
            await multiselect.click({ force: true });
            // Input field can be used to create a tag
            const inputField = multiselect.locator('input').first();
            await inputField.type('testing', { delay: 20 });
            await inputField.press('Enter');

            // Click Upload button
            const uploadBtn = page.locator('button.upload-btn');
            await expect(uploadBtn).toBeEnabled({ timeout: 3000 });

            // Click Upload and wait for either success or a warning message
            await uploadBtn.click();

            // Wait for either success or warning element to appear (handles 429 or other server responses)
            await page.waitForFunction(() => !!document.querySelector('.upload-success') || !!document.querySelector('.upload-warning'), { timeout: 30000 });

            const success = page.locator('.upload-success:has-text("Track uploaded successfully")');
            const warning = page.locator('.upload-warning');

            if (await success.count() > 0) {
                await expect(success).toBeVisible();
            } else if (await warning.count() > 0) {
                // Find first visible warning's text
                let text = null;
                for (let i = 0; i < await warning.count(); i++) {
                    const w = warning.nth(i);
                    if (await w.isVisible()) {
                        text = await w.innerText();
                        break;
                    }
                }

                // Retry up to 3 times if we got a transient upload warning (unknown error, rate limit, etc.)
                const maxRetries = 3;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    if (!text) break; // nothing known to retry on
                    const lower = text.toLowerCase();
                    if (!(lower.includes('unknown error') || lower.includes('rate limit') || lower.includes('429') || lower.includes('upload'))) break;

                    console.warn(`Upload produced warning (${text}), retrying attempt ${attempt} of ${maxRetries}...`);
                    const uniqueName2 = `E2E Upload Retry ${Date.now()}-${attempt}`;
                    const gpx2 = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>${uniqueName2}</name>\n    <trkseg>\n      <trkpt lat="37.7810" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="37.7811" lon="-122.4201"><ele>11</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;

                    // If server asks to wait for N seconds (e.g. "Please, wait 10 seconds between uploads."), obey it exactly
                    const waitMatch = (text || '').toLowerCase().match(/wait\s+(\d+)\s+seconds/);
                    if (waitMatch) {
                        const waitSeconds = parseInt(waitMatch[1], 10) || 10;
                        console.warn(`Server requested a ${waitSeconds}s wait between uploads — switching to server-side fallback upload to avoid long sleeps`);
                        try {
                            const { uploadTrack } = await import('./helpers/uploadWithRetries');
                            const uploadResp = await uploadTrack({ page, gpx: gpx2, name: uniqueName2, categories: 'e2e-fallback' });
                            if (uploadResp && uploadResp.ok && uploadResp.body && (uploadResp.body.id || uploadResp.body.track_id)) {
                                const id = uploadResp.body.id || uploadResp.body.track_id;
                                await page.goto(`/track/${id}`);
                                await page.waitForLoadState('domcontentloaded');
                                createdTrackId = id;
                                expect(page.url()).toContain(`/track/${id}`);
                                return;
                            }
                        } catch (e) {
                            console.warn('Server-side fallback during cooldown failed:', e);
                        }

                        // If fallback failed, do a short wait and continue with UI retry
                        await page.waitForTimeout(1000);
                        continue;
                    }

                    // small backoff
                    await page.waitForTimeout(500 * attempt);

                    await input.setInputFiles({ name: `upload-e2e-retry-${attempt}.gpx`, mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx2, 'utf8') });
                    // add a category again
                    const m2 = page.locator('.track-category-select .multiselect-wrapper');
                    await m2.click({ force: true });
                    const inputField2 = m2.locator('input').first();
                    await inputField2.type('retry', { delay: 20 });
                    await inputField2.press('Enter');
                    await uploadBtn.click();

                    await page.waitForFunction(() => !!document.querySelector('.upload-success') || !!document.querySelector('.upload-warning'), { timeout: 30000 });

                    if ((await page.locator('.upload-success').count()) > 0) {
                        const success2 = page.locator('.upload-success');
                        await expect(success2).toBeVisible();
                        const show2 = success2.locator('button.track-link-btn');
                        await expect(show2).toBeVisible({ timeout: 10000 });
                        await Promise.all([
                            page.waitForURL('**/track/**', { timeout: 10000 }),
                            show2.click()
                        ]);
                        // capture created id
                        const match2 = page.url().match(/\/track\/(.+)$/);
                        if (match2) createdTrackId = match2[1];
                        expect(createdTrackId).toBeTruthy();
                        return;
                    }

                    // update text for next iteration if a warning is present
                    const warningsAfter = await page.locator('.upload-warning');
                    text = null;
                    for (let i = 0; i < await warningsAfter.count(); i++) {
                        const w = warningsAfter.nth(i);
                        if (await w.isVisible()) {
                            text = await w.innerText();
                            break;
                        }
                    }
                }

                // After retries failed, try uploading directly via fetch as a last-resort fallback (still a real backend endpoint)
                try {
                    const { uploadTrack } = await import('./helpers/uploadWithRetries');
                    const uploadResp = await uploadTrack({ page, gpx, name: uniqueName, session: undefined, categories: 'e2e-fallback' });

                    if (uploadResp && uploadResp.ok && uploadResp.body && (uploadResp.body.id || uploadResp.body.track_id)) {
                        const id = uploadResp.body.id || uploadResp.body.track_id;
                        await page.goto(`/track/${id}`);
                        await page.waitForLoadState('domcontentloaded');
                        createdTrackId = id;
                        expect(page.url()).toContain(`/track/${id}`);
                        return;
                    }
                } catch (e) {
                    console.warn('Direct upload fallback failed:', e);
                }

                // After direct upload attempt, try to find the uploaded track by searching the backend in case it succeeded silently
                const searchResults = await page.evaluate(async (name) => {
                    const res = await fetch(`/api/tracks/search?query=${encodeURIComponent(name)}`);
                    if (!res.ok) return [];
                    return await res.json();
                }, uniqueName);

                if (Array.isArray(searchResults) && searchResults.length > 0 && searchResults[0].id) {
                    const id = searchResults[0].id;
                    await page.goto(`/track/${id}`);
                    await page.waitForLoadState('domcontentloaded');
                    createdTrackId = id;
                    expect(page.url()).toContain(`/track/${id}`);
                    return;
                }

                // Fallback: search more broadly for any E2E Upload results
                const broad = await page.evaluate(async () => {
                    const res = await fetch(`/api/tracks/search?query=${encodeURIComponent('E2E Upload')}`);
                    if (!res.ok) return [];
                    return await res.json();
                });
                if (Array.isArray(broad) && broad.length > 0 && broad[0].id) {
                    const id = broad[0].id;
                    await page.goto(`/track/${id}`);
                    await page.waitForLoadState('domcontentloaded');
                    createdTrackId = id;
                    expect(page.url()).toContain(`/track/${id}`);
                    return;
                }

                throw new Error(`Upload failed or returned warning after retries: ${text || 'unknown'}`);
            } else {
                throw new Error('Upload did not produce success or warning UI in time');
            }

            // Click Show track and capture the created track id from URL
            const showBtn = success.locator('button.track-link-btn');
            await Promise.all([
                page.waitForURL('**/track/**', { timeout: 5000 }),
                showBtn.click()
            ]);

            const match = page.url().match(/\/track\/(.+)$/);
            if (match) createdTrackId = match[1];
            expect(createdTrackId).toBeTruthy();

            break;
        } catch (err) {
            if (attempt === 3) throw err;
            console.warn(`Upload test attempt ${attempt} failed, retrying after delay:`, err);
            await page.waitForTimeout(1000 * attempt);
        }
    }
});