/// <reference path="../src/types/e2e.d.ts" />

// @ts-ignore: Playwright test types may not be resolvable in the static analysis environment
import { test, expect } from '@playwright/test';

/**
 * Visual regression test for map controls visibility
 * This test ensures that search and geolocation icons are always visible
 * and not obscured by the map or other elements.
 */
test.describe('Map Controls Visual Regression', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });
        // Wait a bit for map to fully render
        await page.waitForTimeout(1000);
    });

    test('map controls are visible and not obscured by map', async ({ page }) => {
        // Take screenshot of the controls area
        const controlsOverlay = page.locator('.map-controls-overlay');
        await expect(controlsOverlay).toBeVisible();

        // Take screenshot of search button specifically
        const searchButton = page.locator('button.search-button');
        await expect(searchButton).toHaveScreenshot('search-button.png', {
            maxDiffPixels: 100,
            threshold: 0.2
        });

        // Take screenshot of geolocation button
        const geoButton = page.locator('button.geolocation-button');
        await expect(geoButton).toHaveScreenshot('geolocation-button.png', {
            maxDiffPixels: 100,
            threshold: 0.2
        });
    });

    test('map controls overlay is above map layers', async ({ page }) => {
        // Take screenshot of the entire controls area
        const controlsOverlay = page.locator('.map-controls-overlay');

        // Check z-index via computed styles
        const zIndex = await controlsOverlay.evaluate((el) => {
            return window.getComputedStyle(el).zIndex;
        });

        // Z-index should be 1200 (above all Leaflet layers)
        expect(parseInt(zIndex)).toBe(1200);

        // Verify the overlay screenshot shows controls clearly
        await expect(controlsOverlay).toHaveScreenshot('map-controls-overlay.png', {
            maxDiffPixels: 150,
            threshold: 0.2
        });
    });

    test('icons are visible on mobile viewport', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.reload();
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });
        await page.waitForTimeout(1000);

        const searchButton = page.locator('button.search-button');
        const geoButton = page.locator('button.geolocation-button');

        // Take screenshots on mobile
        await expect(searchButton).toHaveScreenshot('search-button-mobile.png', {
            maxDiffPixels: 100,
            threshold: 0.2
        });

        await expect(geoButton).toHaveScreenshot('geolocation-button-mobile.png', {
            maxDiffPixels: 100,
            threshold: 0.2
        });
    });

    test('icons maintain visibility after map interactions', async ({ page }) => {
        const searchButton = page.locator('button.search-button');

        // Initial screenshot
        await expect(searchButton).toHaveScreenshot('search-button-initial.png', {
            maxDiffPixels: 100,
            threshold: 0.2
        });

        // Zoom in
        const zoomInButton = page.locator('.leaflet-control-zoom-in');
        if (await zoomInButton.isVisible()) {
            await zoomInButton.click();
            await page.waitForTimeout(500);
        }

        // Screenshot after zoom - should look the same
        await expect(searchButton).toHaveScreenshot('search-button-after-zoom.png', {
            maxDiffPixels: 100,
            threshold: 0.2
        });
    });
});
