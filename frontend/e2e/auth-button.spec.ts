/// <reference path="../src/types/e2e.d.ts" />

// @ts-ignore: Playwright test types may not be resolvable in the static analysis environment
import { test, expect } from '@playwright/test';

test.describe('Auth Button UI', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to home page
        await page.goto('/');
        // Wait for map to be ready
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    });

    test('login button is visible in bottom-left corner', async ({ page }) => {
        // Find auth button overlay
        const authOverlay = page.locator('.auth-button-overlay');
        await expect(authOverlay).toBeVisible();

        // Check position - should be in bottom-left
        const box = await authOverlay.boundingBox();
        expect(box).toBeTruthy();
        if (box) {
            const viewportSize = page.viewportSize();
            expect(viewportSize).toBeTruthy();
            if (viewportSize) {
                // Should be on left side (left < 50% of viewport width)
                expect(box.x).toBeLessThan(viewportSize.width / 2);
                // Should be on bottom side (top > 50% of viewport height)
                expect(box.y).toBeGreaterThan(viewportSize.height / 2);
            }
        }

        // Find login button
        const loginButton = page.locator('button.login-button');
        await expect(loginButton).toBeVisible();
    });

    test('login button has correct icon-only style', async ({ page }) => {
        const loginButton = page.locator('button.login-button');
        await expect(loginButton).toBeVisible();

        // Check that SVG icon exists and is visible (Google icon)
        const googleIcon = loginButton.locator('svg');
        await expect(googleIcon).toBeVisible();

        // Verify Google brand colors in SVG paths
        const paths = loginButton.locator('svg path');
        const pathCount = await paths.count();
        expect(pathCount).toBe(4); // Google G icon has 4 paths with different colors

        // Check button dimensions (40x40 on desktop)
        const box = await loginButton.boundingBox();
        expect(box).toBeTruthy();
        if (box) {
            expect(box.width).toBeCloseTo(40, 0);
            expect(box.height).toBeCloseTo(40, 0);
        }

        // Button should not contain visible text
        const buttonText = await loginButton.textContent();
        expect(buttonText?.trim()).toBe('');
    });

    test('login button has proper title attribute', async ({ page }) => {
        const loginButton = page.locator('button.login-button');
        await expect(loginButton).toHaveAttribute('title', 'Sign in with Google');
    });

    test('login button is enabled and clickable', async ({ page }) => {
        const loginButton = page.locator('button.login-button');
        await expect(loginButton).toBeEnabled();
    });

    test('login button has hover effect', async ({ page }) => {
        const loginButton = page.locator('button.login-button');
        await expect(loginButton).toBeVisible();

        // Get initial box shadow
        const initialBoxShadow = await loginButton.evaluate((el) => {
            return window.getComputedStyle(el).boxShadow;
        });

        // Hover over the button
        await loginButton.hover();

        // Wait for transition
        await page.waitForTimeout(300);

        // Check box shadow changed on hover
        const hoverBoxShadow = await loginButton.evaluate((el) => {
            return window.getComputedStyle(el).boxShadow;
        });

        // Box shadow should change on hover (become more prominent)
        expect(hoverBoxShadow).not.toBe(initialBoxShadow);
    });

    test('login button does not overlap with filter control', async ({ page }) => {
        // Get auth button position
        const authOverlay = page.locator('.auth-button-overlay');
        const authBox = await authOverlay.boundingBox();

        // Get filter control position
        const filterControl = page.locator('.track-filter-wrapper');

        // Filter control might not be visible if no tracks, so check if it exists first
        const filterExists = await filterControl.count() > 0;
        if (filterExists && await filterControl.isVisible()) {
            const filterBox = await filterControl.boundingBox();

            expect(authBox).toBeTruthy();
            expect(filterBox).toBeTruthy();

            if (authBox && filterBox) {
                // Check no overlap - auth button should be in bottom-left, filter in top-right
                // They should not intersect
                const noOverlap =
                    authBox.x + authBox.width < filterBox.x ||
                    filterBox.x + filterBox.width < authBox.x ||
                    authBox.y + authBox.height < filterBox.y ||
                    filterBox.y + filterBox.height < authBox.y;

                expect(noOverlap).toBe(true);
            }
        }
    });

    test('login button does not overlap with upload form', async ({ page }) => {
        // Get auth button position
        const authOverlay = page.locator('.auth-button-overlay');
        const authBox = await authOverlay.boundingBox();

        // Get upload form container position
        const uploadForm = page.locator('.upload-form-container');
        const uploadExists = await uploadForm.count() > 0;

        if (uploadExists && await uploadForm.isVisible()) {
            const uploadBox = await uploadForm.boundingBox();

            expect(authBox).toBeTruthy();
            expect(uploadBox).toBeTruthy();

            if (authBox && uploadBox) {
                // Check no overlap
                const noOverlap =
                    authBox.x + authBox.width < uploadBox.x ||
                    uploadBox.x + uploadBox.width < authBox.x ||
                    authBox.y + authBox.height < uploadBox.y ||
                    uploadBox.y + uploadBox.height < authBox.y;

                expect(noOverlap).toBe(true);
            }
        }
    });

    test('login button is above map controls on left side', async ({ page }) => {
        // Get auth button position
        const authOverlay = page.locator('.auth-button-overlay');
        const authBox = await authOverlay.boundingBox();

        // Get map controls overlay position (search + geolocation buttons)
        const mapControls = page.locator('.map-controls-overlay');
        const mapControlsExists = await mapControls.count() > 0;

        if (mapControlsExists && await mapControls.isVisible()) {
            const mapControlsBox = await mapControls.boundingBox();

            expect(authBox).toBeTruthy();
            expect(mapControlsBox).toBeTruthy();

            if (authBox && mapControlsBox) {
                // Both are on left side
                expect(authBox.x).toBeLessThan(500); // Left side
                expect(mapControlsBox.x).toBeLessThan(500); // Left side

                // Auth button should be below map controls (higher y = lower on screen)
                expect(authBox.y).toBeGreaterThan(mapControlsBox.y);
            }
        }
    });

    test('avatar button navigates to account when authenticated', async ({ page }) => {
        // Simulate authenticated state via dev-only hook
        await page.evaluate(() => {
            window.__tracklyAuthE2E?.setAuthenticated({
                name: 'Test User',
                email: 'test@example.com',
                avatar_url: null
            });
        });

        const userButton = page.locator('button.user-button');
        await expect(userButton).toBeVisible();

        await userButton.click();
        await expect(page).toHaveURL(/\/account$/);
    });
});

test.describe('Auth Button Mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test('login button is visible on mobile', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        const loginButton = page.locator('button.login-button');
        await expect(loginButton).toBeVisible();

        // Check button dimensions (44x44 on mobile)
        const box = await loginButton.boundingBox();
        expect(box).toBeTruthy();
        if (box) {
            expect(box.width).toBeCloseTo(44, 0);
            expect(box.height).toBeCloseTo(44, 0);
        }
    });

    test('login button remains in bottom-left on mobile', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        const authOverlay = page.locator('.auth-button-overlay');
        const box = await authOverlay.boundingBox();

        expect(box).toBeTruthy();
        if (box) {
            const viewportSize = page.viewportSize();
            if (viewportSize) {
                // Should be on left side
                expect(box.x).toBeLessThan(viewportSize.width / 2);
                // Should be on bottom side
                expect(box.y).toBeGreaterThan(viewportSize.height / 2);
            }
        }
    });
});
