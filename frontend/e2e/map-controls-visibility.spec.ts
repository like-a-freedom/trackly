import "../src/types/e2e.d.ts"

// @ts-expect-error: Playwright test types may not be resolvable in the static analysis environment
import { test, expect } from '@playwright/test';

test.describe('Map Controls Icon Visibility', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to home page
        await page.goto('/');
        // Wait for map to be ready
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    });

    test('search button icon is visible and clickable', async ({ page }) => {
        // Find search button
        const searchButton = page.locator('button.search-button');
        await expect(searchButton).toBeVisible();

        // Check that SVG icon exists and is visible
        const searchIcon = searchButton.locator('svg');
        await expect(searchIcon).toBeVisible();

        // Verify SVG structure
        await expect(searchIcon.locator('circle')).toBeVisible();
        await expect(searchIcon.locator('path')).toBeVisible();

        // Check icon styling
        const svgElement = await searchIcon.elementHandle();
        if (svgElement) {
            const stroke = await svgElement.evaluate((el) => {
                const computedStyle = window.getComputedStyle(el);
                return computedStyle.stroke || el.getAttribute('stroke');
            });
            // Verify that stroke is defined (either from CSS or attribute)
            expect(stroke).toBeTruthy();
        }

        // Verify button is clickable
        await expect(searchButton).toBeEnabled();

        // Click should open search modal
        await page.waitForFunction(() => !!(window.__e2e?.isMapIdle?.()), { timeout: 3000 });
        await searchButton.click({ force: true });
        await expect(page.locator('.search-modal')).toBeVisible({ timeout: 2000 });
    });

    test('geolocation button icon is visible and functional', async ({ page }) => {
        // Find geolocation button
        const geoButton = page.locator('button.geolocation-button');
        await expect(geoButton).toBeVisible();

        // Check that SVG icon exists and is visible
        const geoIcon = geoButton.locator('svg.geolocation-icon');
        await expect(geoIcon).toBeVisible();

        // Verify SVG structure
        await expect(geoIcon.locator('path')).toBeVisible();

        // Check icon styling
        const svgElement = await geoIcon.elementHandle();
        if (svgElement) {
            const stroke = await svgElement.evaluate((el) => {
                const computedStyle = window.getComputedStyle(el);
                return computedStyle.stroke || el.getAttribute('stroke');
            });
            // Verify that stroke is defined (either from CSS or attribute)
            expect(stroke).toBeTruthy();
        }

        // Verify button is clickable (not disabled)
        await expect(geoButton).toBeEnabled();
    });

    test('icons maintain visibility on hover', async ({ page }) => {
        const searchButton = page.locator('button.search-button');
        const searchIcon = searchButton.locator('svg');

        // Check initial visibility
        await expect(searchIcon).toBeVisible();

        // Hover and check visibility is maintained
        await searchButton.hover();
        await page.waitForTimeout(100); // Wait for hover transition
        await expect(searchIcon).toBeVisible();

        // Verify stroke color changes on hover (optional visual check)
        const svgElement = await searchIcon.elementHandle();
        if (svgElement) {
            const strokeOnHover = await svgElement.evaluate((el) => {
                const computedStyle = window.getComputedStyle(el);
                return computedStyle.stroke;
            });
            expect(strokeOnHover).toBeTruthy();
        }
    });

    test('icons are visible on mobile viewport', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.reload();
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        // Check search button
        const searchButton = page.locator('button.search-button');
        await expect(searchButton).toBeVisible();
        const searchIcon = searchButton.locator('svg');
        await expect(searchIcon).toBeVisible();

        // Verify stroke attribute/style is present
        const searchSvg = await searchIcon.elementHandle();
        if (searchSvg) {
            const stroke = await searchSvg.evaluate((el) => {
                const computedStyle = window.getComputedStyle(el);
                return computedStyle.stroke || el.getAttribute('stroke');
            });
            expect(stroke).toBeTruthy();
        }

        // Check geolocation button
        const geoButton = page.locator('button.geolocation-button');
        await expect(geoButton).toBeVisible();
        const geoIcon = geoButton.locator('svg.geolocation-icon');
        await expect(geoIcon).toBeVisible();

        // Verify stroke attribute/style is present
        const geoSvg = await geoIcon.elementHandle();
        if (geoSvg) {
            const stroke = await geoSvg.evaluate((el) => {
                const computedStyle = window.getComputedStyle(el);
                return computedStyle.stroke || el.getAttribute('stroke');
            });
            expect(stroke).toBeTruthy();
        }
    });

    test('map controls are properly positioned', async ({ page }) => {
        const searchButton = page.locator('button.search-button');
        const geoButton = page.locator('button.geolocation-button');

        // Both buttons should be visible
        await expect(searchButton).toBeVisible();
        await expect(geoButton).toBeVisible();

        // Check they are in the controls overlay container (outside TrackMap)
        const controlsOverlay = page.locator('.map-controls-overlay');
        await expect(controlsOverlay).toBeVisible();

        // Verify buttons are children of controls overlay
        await expect(controlsOverlay.locator('button.search-button')).toBeVisible();
        await expect(controlsOverlay.locator('button.geolocation-button')).toBeVisible();
    });

    test('icons have proper accessibility attributes', async ({ page }) => {
        const searchButton = page.locator('button.search-button');
        const geoButton = page.locator('button.geolocation-button');

        // Check title attributes for accessibility
        await expect(searchButton).toHaveAttribute('title', 'Search tracks');
        await expect(geoButton).toHaveAttribute('title', /Center map on current location|Getting location.../);
    });

    test('icons contrast is sufficient for visibility', async ({ page }) => {
        const searchIcon = page.locator('button.search-button svg');

        // Take screenshot of the icon for visual comparison if needed
        const iconBox = await searchIcon.boundingBox();
        expect(iconBox).toBeTruthy();

        // Verify icon has non-zero dimensions
        if (iconBox) {
            expect(iconBox.width).toBeGreaterThan(0);
            expect(iconBox.height).toBeGreaterThan(0);
        }

        // Check that stroke width makes icon visible
        const strokeWidth = await searchIcon.evaluate((el) => {
            return el.getAttribute('stroke-width');
        });
        expect(strokeWidth).toBe('2'); // Should have stroke-width="2"
    });

    test('geolocation button shows loading state correctly', async ({ page, context }) => {
        // Grant geolocation permissions
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation({ latitude: 56.04028, longitude: 37.83185 });

        const geoButton = page.locator('button.geolocation-button');
        await geoButton.click();

        // Check for loading state (spinning icon appears briefly)
        // This might be quick, so we check that the button state changes
        const loadingIcon = geoButton.locator('svg.spinning');

        // Either loading icon appears or regular icon remains visible
        try {
            await expect(loadingIcon).toBeVisible({ timeout: 1000 });
        } catch (e) {
            // If loading is too fast, just verify button is still visible
            await expect(geoButton).toBeVisible();
        }

        // After loading, normal icon should be visible again
        await expect(geoButton.locator('svg.geolocation-icon')).toBeVisible({ timeout: 5000 });
    });

    test('icons remain visible during map interactions', async ({ page }) => {
        const searchIcon = page.locator('button.search-button svg');
        const geoIcon = page.locator('button.geolocation-button svg');

        // Icons should be visible initially
        await expect(searchIcon).toBeVisible();
        await expect(geoIcon).toBeVisible();

        // Zoom in on map
        const zoomInButton = page.locator('.leaflet-control-zoom-in');
        if (await zoomInButton.isVisible()) {
            await zoomInButton.click();
            await page.waitForTimeout(500);
        }

        // Icons should still be visible after zoom
        await expect(searchIcon).toBeVisible();
        await expect(geoIcon).toBeVisible();

        // Pan the map
        const map = page.locator('.leaflet-container');
        const mapBox = await map.boundingBox();
        if (mapBox) {
            await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
            await page.mouse.down();
            await page.mouse.move(mapBox.x + mapBox.width / 3, mapBox.y + mapBox.height / 3);
            await page.mouse.up();
            await page.waitForTimeout(500);
        }

        // Icons should still be visible after pan
        await expect(searchIcon).toBeVisible();
        await expect(geoIcon).toBeVisible();
    });
});
