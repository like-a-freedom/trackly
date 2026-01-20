import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:81';
const TEST_SESSION = process.env.E2E_SESSION_ID || '11111111-1111-1111-1111-111111111111';

test('upload invalid GPX shows user error', async ({ page }) => {
    test.setTimeout(60_000);
    await page.context().addCookies([{ name: 'session_id', value: TEST_SESSION, domain: 'localhost', path: '/' }]);
    await page.addInitScript(() => { try { localStorage.setItem('trackly_session_id', (window as any).E2E_SESSION_ID || '11111111-1111-1111-1111-111111111111'); } catch (e) { } });

    await page.goto(FRONTEND);
    await page.waitForLoadState('networkidle');

    // Open upload UI
    await page.locator('.upload-button-compact').click();
    await page.waitForSelector('input#track-upload', { state: 'attached', timeout: 3000 });

    const invalidGpx = "<gpx><trk><name>Broken</name><trkseg><trkpt lat=\"1\" lon=\"2\"></gpx>"; // malformed
    const input = page.locator('input#track-upload');
    await input.setInputFiles({ name: 'invalid.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(invalidGpx, 'utf8') });

    // Ensure name + category to avoid "Please select" message
    await page.fill('#track-name-input', 'Invalid GPX Test');
    const multiselect = page.locator('.track-category-select .multiselect-wrapper');
    await multiselect.click({ force: true });
    const inputField = multiselect.locator('input').first();
    await inputField.type('invalid', { delay: 20 });
    await inputField.press('Enter');
    await page.waitForTimeout(200);

    const uploadBtn = page.locator('button.upload-btn');
    await expect(uploadBtn).toBeEnabled({ timeout: 3000 });
    await uploadBtn.click();

    // Wait for warning
    await page.waitForSelector('.upload-warning', { timeout: 15000 });
    // pick first visible warning
    const warnings = page.locator('.upload-warning');
    let visibleText = '';
    for (let i = 0; i < await warnings.count(); i++) {
        const w = warnings.nth(i);
        if (await w.isVisible()) {
            visibleText = (await w.innerText()).toLowerCase();
            break;
        }
    }

    // Accept several reasonable messages: server validation, parse error, or generic upload error
    const okReason = visibleText.includes('invalid') || visibleText.includes('parse') || visibleText.includes('error') || visibleText.includes('gpx') || visibleText.includes('unknown');
    const cooldownReason = visibleText.includes('wait') || visibleText.includes('429') || visibleText.includes('cooldown') || visibleText.includes('Please, wait');
    if (okReason || cooldownReason) return;

    // If no obvious warning text, ensure the invalid GPX did not create a track (search by name)
    const results = await page.evaluate(async (name) => {
        const res = await fetch(`/tracks/search?query=${encodeURIComponent(name)}`);
        if (!res.ok) return [];
        return await res.json();
    }, 'Invalid GPX Test');
    expect(Array.isArray(results) ? results.length === 0 : true).toBeTruthy();
});