/// <reference path="../src/types/e2e.d.ts" />

import { test, expect } from '@playwright/test';
import { setupTestTracks } from './setup-real-tracks';

let testTracks: Record<string, string> = {};

test.beforeAll(async () => {
    testTracks = await setupTestTracks();
});

test('export: client reads cooldown header and starts cooldown', async ({ page }) => {
    const trackId = testTracks['test-track-e2e'];
    await page.addInitScript(() => { try { localStorage.setItem('trackly_session_id', 'e2e-test-session'); } catch (e) { } });
    await page.goto(`/track/${trackId}`);

    const exportBtn = page.locator('.export-gpx-btn');
    await expect(exportBtn).toBeVisible();

    // Mock successful export with cooldown header
    await page.route(`**/tracks/${trackId}/export`, async route => {
        await route.fulfill({
            status: 200,
            headers: {
                'content-disposition': 'attachment; filename="mock.gpx"',
                'x-export-rate-limit-seconds': '7',
                'access-control-expose-headers': 'X-Export-Rate-Limit-Seconds, Retry-After'
            },
            body: '<gpx></gpx>'
        });
    });

    await exportBtn.click();
    await page.waitForTimeout(150);
    await expect(exportBtn).toHaveAttribute('disabled', '');
    await expect(exportBtn).toHaveAttribute('title', /wait 7s/);

    // Clean up route
    await page.unroute(`**/tracks/${trackId}/export`);
});


test('export: client handles 429 responses (shows toast and starts cooldown)', async ({ page }) => {
    const trackId = testTracks['test-track-e2e'];
    await page.addInitScript(() => { try { localStorage.setItem('trackly_session_id', 'e2e-test-session'); } catch (e) { } });
    await page.goto(`/track/${trackId}`);

    const exportBtn = page.locator('.export-gpx-btn');
    await expect(exportBtn).toBeVisible();

    // Mock 429 response
    await page.route(`**/tracks/${trackId}/export`, async route => {
        await route.fulfill({
            status: 429,
            headers: { 'retry-after': '5', 'access-control-expose-headers': 'X-Export-Rate-Limit-Seconds, Retry-After' },
            body: ''
        });
    });

    await exportBtn.click();
    // Verify client started cooldown by checking button title and disabled state
    await expect(exportBtn).toHaveAttribute('disabled', '');
    await expect(exportBtn).toHaveAttribute('title', /wait 5s/);

    await page.unroute(`**/tracks/${trackId}/export`);
});