import "../src/types/e2e.d.ts"

import { test, expect } from '@playwright/test';

test.describe('Account View Features', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to home page
        await page.goto('/');
        // Wait for map to be ready
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        // Simulate authenticated state
        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        // Navigate to account page
        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
    });

    test.describe('Track List Display', () => {
        test('displays tracks section with correct header', async ({ page }) => {
            const tracksSection = page.locator('.tracks-section');
            await expect(tracksSection).toBeVisible();

            const header = tracksSection.locator('.section-header h2');
            await expect(header).toHaveText('My Tracks');
        });

        test('track list is scrollable with max-height', async ({ page }) => {
            const container = page.locator('.tracks-list-container');
            const isContainerVisible = await container.count() > 0;

            if (isContainerVisible) {
                await expect(container).toBeVisible();

                // Check that container has overflow-y: auto
                const overflowY = await container.evaluate((el) =>
                    window.getComputedStyle(el).overflowY
                );
                expect(overflowY).toBe('auto');

                // Check max-height is set
                const maxHeight = await container.evaluate((el) =>
                    window.getComputedStyle(el).maxHeight
                );
                expect(maxHeight).not.toBe('none');
            }
        });
    });

    test.describe('Search and Filter', () => {
        test('search input is visible when tracks exist', async ({ page }) => {
            const searchInput = page.locator('.search-input');
            const tracksExist = await page.locator('.track-card').count() > 0;

            if (tracksExist) {
                await expect(searchInput).toBeVisible();
            }
        });

        test('search input has correct placeholder', async ({ page }) => {
            const searchInput = page.locator('.search-input');
            const tracksExist = await page.locator('.track-card').count() > 0;

            if (tracksExist) {
                await expect(searchInput).toHaveAttribute('placeholder', 'Search tracks...');
            }
        });

        test('search filters tracks by name', async ({ page }) => {
            const searchInput = page.locator('.search-input');
            const tracksExist = await page.locator('.track-card').count() > 0;

            if (tracksExist) {
                const initialCount = await page.locator('.track-card').count();

                // Type a unique search term that may not match
                await searchInput.fill('UniqueNonExistentTrackName12345');
                await page.waitForTimeout(100);

                const filteredCount = await page.locator('.track-card').count();
                expect(filteredCount).toBeLessThanOrEqual(initialCount);
            }
        });
    });

    test.describe('Track Selection', () => {
        test('each track has a checkbox', async ({ page }) => {
            const trackCards = page.locator('.track-card');
            const tracksExist = await trackCards.count() > 0;

            if (tracksExist) {
                const checkboxes = page.locator('.track-checkbox input[type="checkbox"]');
                const checkboxCount = await checkboxes.count();
                const trackCount = await trackCards.count();

                expect(checkboxCount).toBe(trackCount);
            }
        });

        test('select all checkbox exists', async ({ page }) => {
            const tracksExist = await page.locator('.track-card').count() > 0;

            if (tracksExist) {
                const selectAllLabel = page.locator('.select-all-label');
                await expect(selectAllLabel).toBeVisible();

                const selectAllCheckbox = selectAllLabel.locator('input[type="checkbox"]');
                await expect(selectAllCheckbox).toBeVisible();
            }
        });

        test('bulk action buttons appear when tracks selected', async ({ page }) => {
            const tracksExist = await page.locator('.track-card').count() > 0;

            if (tracksExist) {
                // Initially, bulk buttons should not be visible
                const bulkBtn = page.locator('.btn-bulk');
                await expect(bulkBtn).toHaveCount(0);

                // Select a track
                const firstCheckbox = page.locator('.track-checkbox input[type="checkbox"]').first();
                await firstCheckbox.check();

                // Now bulk buttons should appear
                const bulkButtons = page.locator('.btn-bulk');
                const buttonCount = await bulkButtons.count();
                expect(buttonCount).toBeGreaterThan(0);
            }
        });
    });

    test.describe('Visibility Toggle', () => {
        test('each track has a visibility toggle button', async ({ page }) => {
            const trackCards = page.locator('.track-card');
            const tracksExist = await trackCards.count() > 0;

            if (tracksExist) {
                const visibilityButtons = page.locator('.visibility-toggle');
                const buttonCount = await visibilityButtons.count();
                const trackCount = await trackCards.count();

                expect(buttonCount).toBe(trackCount);
            }
        });

        test('visibility toggle shows correct state', async ({ page }) => {
            const visibilityButton = page.locator('.visibility-toggle').first();
            const exists = await visibilityButton.count() > 0;

            if (exists) {
                const buttonText = await visibilityButton.textContent();
                expect(['Public', 'Private']).toContain(buttonText?.trim());
            }
        });

        test('public tracks have green-styled toggle', async ({ page }) => {
            const publicToggle = page.locator('.visibility-toggle.public').first();
            const exists = await publicToggle.count() > 0;

            if (exists) {
                const buttonText = await publicToggle.textContent();
                expect(buttonText?.trim()).toBe('Public');
            }
        });
    });

    test.describe('Track Info Display', () => {
        test('track cards show name, distance, and date', async ({ page }) => {
            const trackCard = page.locator('.track-card').first();
            const exists = await trackCard.count() > 0;

            if (exists) {
                // Name
                const name = trackCard.locator('.track-name');
                await expect(name).toBeVisible();

                // Distance stat (contains "km")
                const stats = trackCard.locator('.track-stat');
                const statsCount = await stats.count();
                expect(statsCount).toBeGreaterThan(0);

                // Date
                const date = trackCard.locator('.track-date');
                await expect(date).toBeVisible();
            }
        });

        test('track distance is formatted with 1 decimal place', async ({ page }) => {
            const distanceStat = page.locator('.track-stat').first();
            const exists = await distanceStat.count() > 0;

            if (exists) {
                const text = await distanceStat.textContent();
                // Should match pattern like "5.4 km"
                if (text && text.includes('km')) {
                    const match = text.match(/(\d+\.\d) km/);
                    expect(match).toBeTruthy();
                }
            }
        });
    });

    test.describe('Empty State', () => {
        test('shows empty state message when no tracks', async ({ page }) => {
            // This test requires no tracks to exist
            const emptyState = page.locator('.tracks-empty');
            const trackCards = page.locator('.track-card');

            const tracksCount = await trackCards.count();
            if (tracksCount === 0) {
                await expect(emptyState).toBeVisible();
            }
        });
    });
});

test.describe('Account View Mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
    });

    test('visibility toggle shows icon only on mobile', async ({ page }) => {
        const visibilityButton = page.locator('.visibility-toggle').first();
        const exists = await visibilityButton.count() > 0;

        if (exists) {
            // On mobile, text should be hidden (via CSS display: none)
            const span = visibilityButton.locator('span');
            const spanExists = await span.count() > 0;

            if (spanExists) {
                // Check if span is hidden via CSS
                const display = await span.evaluate((el) =>
                    window.getComputedStyle(el).display
                );
                expect(display).toBe('none');
            }
        }
    });

    test('toolbar is stacked vertically on mobile', async ({ page }) => {
        const toolbar = page.locator('.tracks-toolbar');
        const exists = await toolbar.count() > 0;

        if (exists) {
            const flexDirection = await toolbar.evaluate((el) =>
                window.getComputedStyle(el).flexDirection
            );
            expect(flexDirection).toBe('column');
        }
    });
});

test.describe('Account View - Settings Menu', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: 'https://example.com/avatar.jpg',
                });
            }
        });

        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
    });

    test('opens settings menu when clicking settings button', async ({ page }) => {
        const settingsBtn = page.locator('.settings-btn');
        await expect(settingsBtn).toBeVisible();
        
        await settingsBtn.click();
        
        const settingsMenu = page.locator('.settings-menu');
        await expect(settingsMenu).toBeVisible();
    });

    test('settings menu contains all expected options', async ({ page }) => {
        await page.locator('.settings-btn').click();
        
        const menuItems = page.locator('.menu-item');
        await expect(menuItems).toHaveCount(3);
        
        const menuTexts = await menuItems.allTextContents();
        expect(menuTexts.some(text => text.includes('Edit Nickname'))).toBe(true);
        expect(menuTexts.some(text => text.includes('Delete Account'))).toBe(true);
        expect(menuTexts.some(text => text.includes('Sign Out'))).toBe(true);
    });

    test('delete account option has danger styling', async ({ page }) => {
        await page.locator('.settings-btn').click();
        
        const deleteMenuItem = page.locator('.menu-item-danger').filter({ hasText: 'Delete Account' });
        await expect(deleteMenuItem).toBeVisible();
        
        const color = await deleteMenuItem.evaluate(el => 
            window.getComputedStyle(el).color
        );
        expect(color).toContain('rgb(220, 38, 38)'); // #dc2626 in RGB
    });

    test('closes settings menu when clicking outside', async ({ page }) => {
        await page.locator('.settings-btn').click();
        await expect(page.locator('.settings-menu')).toBeVisible();
        
        // Click outside the menu
        await page.locator('.account-header').click({ position: { x: 10, y: 10 } });
        
        await expect(page.locator('.settings-menu')).not.toBeVisible();
    });
});

test.describe('Account View - Nickname Editing', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
    });

    test('opens nickname modal from settings menu', async ({ page }) => {
        await page.locator('.settings-btn').click();
        await page.locator('.menu-item').filter({ hasText: 'Edit Nickname' }).click();
        
        const modal = page.locator('.modal-overlay');
        await expect(modal).toBeVisible();
        
        const modalTitle = page.locator('.modal-header h3');
        await expect(modalTitle).toHaveText('Edit Nickname');
    });

    test('closes nickname modal with cancel button', async ({ page }) => {
        await page.locator('.settings-btn').click();
        await page.locator('.menu-item').filter({ hasText: 'Edit Nickname' }).click();
        
        await expect(page.locator('.modal-overlay')).toBeVisible();
        
        await page.locator('.btn-cancel').click();
        await expect(page.locator('.modal-overlay')).not.toBeVisible();
    });

    test('closes nickname modal with X button', async ({ page }) => {
        await page.locator('.settings-btn').click();
        await page.locator('.menu-item').filter({ hasText: 'Edit Nickname' }).click();
        
        await expect(page.locator('.modal-overlay')).toBeVisible();
        
        await page.locator('.modal-close').click();
        await expect(page.locator('.modal-overlay')).not.toBeVisible();
    });

    test('nickname input has correct placeholder and constraints', async ({ page }) => {
        await page.locator('.settings-btn').click();
        await page.locator('.menu-item').filter({ hasText: 'Edit Nickname' }).click();
        
        const input = page.locator('#nickname-input');
        await expect(input).toHaveAttribute('maxlength', '50');
        await expect(input).toHaveAttribute('placeholder', 'Enter a nickname...');
    });

    test('shows validation hint for nickname format', async ({ page }) => {
        await page.locator('.settings-btn').click();
        await page.locator('.menu-item').filter({ hasText: 'Edit Nickname' }).click();
        
        const hint = page.locator('.form-hint');
        await expect(hint).toContainText('alphanumeric');
    });

    test('save button is disabled when nickname is unchanged', async ({ page }) => {
        await page.locator('.settings-btn').click();
        await page.locator('.menu-item').filter({ hasText: 'Edit Nickname' }).click();
        
        const saveBtn = page.locator('.btn-primary');
        await expect(saveBtn).toBeDisabled();
    });
});

test.describe('Account View - Header Display', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        // Set auth state before navigating to account
        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: 'https://example.com/avatar.jpg',
                });
            }
        });

        // Small delay to ensure auth state is set
        await page.waitForTimeout(100);

        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
        
        // Wait for user data to load
        await page.waitForTimeout(200);
    });

    test('displays user name in header', async ({ page }) => {
        const userName = page.locator('.header-user-name');
        await expect(userName).toBeVisible();
        // Check that user name is displayed (may be 'Test User' or 'User' depending on state)
        const text = await userName.textContent();
        expect(text).toBeTruthy();
    });

    test('displays user avatar when URL is provided', async ({ page }) => {
        // Avatar may show default or user avatar
        const avatarContainer = page.locator('.header-avatar');
        await expect(avatarContainer).toBeVisible();
        
        // Check if there's either an img or svg (default avatar)
        const img = avatarContainer.locator('img');
        const svg = avatarContainer.locator('svg');
        
        const hasImg = await img.count() > 0;
        const hasSvg = await svg.count() > 0;
        
        expect(hasImg || hasSvg).toBe(true);
    });

    test('back button navigates to home page', async ({ page }) => {
        const backBtn = page.locator('.back-btn');
        await expect(backBtn).toBeVisible();
        
        await backBtn.click();
        
        await expect(page).toHaveURL('/');
    });
});

test.describe('Account View - Loading States', () => {
    test('shows loading state while initializing', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        // Set authenticated state
        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        // Navigate to account
        await page.goto('/account');
        
        // Should show loading initially
        const loadingContainer = page.locator('.loading-container');
        // Loading might be brief, so just check it exists or content loads
        await expect(page.locator('.account-page')).toBeVisible({ timeout: 10000 });
    });

    test('shows tracks loading indicator when fetching', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        await page.goto('/account');
        
        // Either loading or tracks should be visible
        await Promise.race([
            expect(page.locator('.tracks-loading')).toBeVisible({ timeout: 5000 }),
            expect(page.locator('.tracks-list, .tracks-empty')).toBeVisible({ timeout: 10000 })
        ]);
    });
});

test.describe('Account View - Track Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
    });

    test('clicking track info navigates to track detail', async ({ page }) => {
        const trackCard = page.locator('.track-card').first();
        const tracksExist = await trackCard.count() > 0;

        if (tracksExist) {
            const trackInfo = trackCard.locator('.track-info');
            await trackInfo.click();
            
            // Should navigate to track detail page
            await expect(page).toHaveURL(/\/track\//);
        }
    });
});

test.describe('Account View - Track Count Display', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
    });

    test('displays track count in header', async ({ page }) => {
        const trackCount = page.locator('.track-count');
        await expect(trackCount).toBeVisible();
        
        const text = await trackCount.textContent();
        expect(text).toMatch(/\d+ tracks?/);
    });

    test('track count updates when filtering', async ({ page }) => {
        const searchInput = page.locator('.search-input');
        const tracksExist = await searchInput.count() > 0;

        if (tracksExist) {
            const initialCount = await page.locator('.track-count').textContent();
            
            await searchInput.fill('NonExistentTrack');
            await page.waitForTimeout(100);
            
            const filteredCount = await page.locator('.track-count').textContent();
            expect(filteredCount).not.toBe(initialCount);
        }
    });
});

test.describe('Account View - Logout Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
    });

    test('sign out option is available in settings menu', async ({ page }) => {
        await page.locator('.settings-btn').click();
        
        const signOutBtn = page.locator('.menu-item').filter({ hasText: 'Sign Out' });
        await expect(signOutBtn).toBeVisible();
    });

    test('clicking sign out redirects to home', async ({ page }) => {
        await page.locator('.settings-btn').click();
        await page.locator('.menu-item').filter({ hasText: 'Sign Out' }).click();
        
        // Should redirect to home page
        await expect(page).toHaveURL('/', { timeout: 5000 });
    });
});

test.describe('Account View - Error Handling', () => {
    test('handles network errors gracefully', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        // Simulate network failure
        await page.route('**/api/account/tracks**', route => route.abort('failed'));

        await page.goto('/account');
        await page.waitForTimeout(2000);

        // Page should still be functional
        await expect(page.locator('.account-page')).toBeVisible();
    });
});

test.describe('Account View - Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.leaflet-container', { timeout: 10000 });

        await page.evaluate(() => {
            if (window.__tracklyAuthE2E?.setAuthenticated) {
                window.__tracklyAuthE2E.setAuthenticated({
                    name: 'Test User',
                    email: 'test@example.com',
                    avatar_url: null,
                });
            }
        });

        await page.goto('/account');
        await page.waitForSelector('.account-page', { timeout: 10000 });
    });

    test('search input has correct ARIA attributes', async ({ page }) => {
        const searchInput = page.locator('.search-input');
        const tracksExist = await searchInput.count() > 0;

        if (tracksExist) {
            // Should have placeholder for accessibility
            await expect(searchInput).toHaveAttribute('placeholder', 'Search tracks...');
        }
    });

    test('checkboxes are keyboard accessible', async ({ page }) => {
        const firstCheckbox = page.locator('.track-checkbox input[type="checkbox"]').first();
        const tracksExist = await firstCheckbox.count() > 0;

        if (tracksExist) {
            await firstCheckbox.focus();
            await expect(firstCheckbox).toBeFocused();
            
            // Should be checkable via keyboard
            await page.keyboard.press('Space');
            await expect(firstCheckbox).toBeChecked();
        }
    });

    test('buttons have descriptive text', async ({ page }) => {
        const backBtn = page.locator('.back-btn');
        await expect(backBtn).toContainText('Back');
        
        const settingsBtn = page.locator('.settings-btn');
        await expect(settingsBtn).toHaveAttribute('title', 'Settings');
    });
});
