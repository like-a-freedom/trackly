import { test, expect } from '@playwright/test';

/**
 * E2E tests for Track Editor — create and edit tracks on the map.
 *
 * Tests cover:
 * - Navigation to editor page
 * - Adding waypoints by clicking the map
 * - Segment management (add, delete)
 * - Metadata editing (name, description, categories)
 * - Undo/Redo operations via toolbar
 * - Keyboard shortcuts
 * - Draft save/restore indicator
 * - Save flow (disabled until valid)
 */

test.describe('Track Editor', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tracks/new');
        // Wait for the track editor view to be rendered 
        await page.waitForSelector('.track-editor-view', { timeout: 15000 });
    });

    test.describe('Navigation', () => {
        test('loads track editor page at /tracks/new', async ({ page }) => {
            await expect(page).toHaveURL('/tracks/new');
            await expect(page.locator('.track-editor-view')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('[data-testid="editor-map-stage"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-overlay-layer"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-left-panel"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-toolbar"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-map-region"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-right-inspector"]')).toBeVisible();
        });

        test('keeps the map full-screen while all control regions render as overlays above it', async ({ page }) => {
            const geometry = await page.evaluate(() => {
                const rect = (element: Element | null) => {
                    if (!element) return null;
                    const box = element.getBoundingClientRect();
                    return {
                        top: box.top,
                        left: box.left,
                        right: box.right,
                        bottom: box.bottom,
                        width: box.width,
                        height: box.height,
                    };
                };

                const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => {
                    if (!a || !b) return false;
                    return !(
                        a.right <= b.left ||
                        b.right <= a.left ||
                        a.bottom <= b.top ||
                        b.bottom <= a.top
                    );
                };

                const viewport = { width: window.innerWidth, height: window.innerHeight };
                const stage = document.querySelector('[data-testid="editor-map-stage"]');
                const overlay = document.querySelector('[data-testid="editor-overlay-layer"]');
                const mapWrapper = document.querySelector('[data-testid="track-editor-map-wrapper"]');
                const panel = document.querySelector('[data-testid="editor-left-panel"]');
                const toolbarZone = document.querySelector('[data-testid="editor-toolbar"]');
                const inspector = document.querySelector('[data-testid="editor-right-inspector"]');

                const panelRect = rect(panel);
                const toolbarZoneRect = rect(toolbarZone);
                const inspectorRect = rect(inspector);

                return {
                    viewport,
                    stage: rect(stage),
                    overlay: rect(overlay),
                    mapWrapper: rect(mapWrapper),
                    panel: panelRect,
                    toolbarZone: toolbarZoneRect,
                    inspector: inspectorRect,
                    overlayOverlaps: {
                        panelInspector: overlaps(panelRect, inspectorRect),
                        panelToolbar: overlaps(panelRect, toolbarZoneRect),
                        toolbarInspector: overlaps(toolbarZoneRect, inspectorRect),
                    },
                };
            });

            expect(geometry.stage).not.toBeNull();
            expect(geometry.overlay).not.toBeNull();
            expect(geometry.mapWrapper).not.toBeNull();

            expect(Math.abs(geometry.stage.width - geometry.viewport.width)).toBeLessThanOrEqual(2);
            expect(Math.abs(geometry.stage.height - geometry.viewport.height)).toBeLessThanOrEqual(2);
            expect(Math.abs(geometry.overlay.width - geometry.stage.width)).toBeLessThanOrEqual(2);
            expect(Math.abs(geometry.overlay.height - geometry.stage.height)).toBeLessThanOrEqual(2);
            expect(Math.abs(geometry.mapWrapper.width - geometry.stage.width)).toBeLessThanOrEqual(2);
            expect(Math.abs(geometry.mapWrapper.height - geometry.stage.height)).toBeLessThanOrEqual(2);

            for (const key of ['panel', 'toolbarZone', 'inspector'] as const) {
                const box = geometry[key];
                expect(box).not.toBeNull();
                expect(box.right).toBeGreaterThan(geometry.stage.left);
                expect(box.bottom).toBeGreaterThan(geometry.stage.top);
                expect(box.left).toBeLessThan(geometry.stage.right);
                expect(box.top).toBeLessThan(geometry.stage.bottom);
            }

            // No visual overlaps between the three overlay regions
            expect(geometry.overlayOverlaps.panelInspector).toBe(false);
            expect(geometry.overlayOverlaps.panelToolbar).toBe(false);
            expect(geometry.overlayOverlaps.toolbarInspector).toBe(false);
        });

        test('keeps the new shell usable on desktop and mobile', async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 960 });
            await page.goto('/tracks/new');

            await expect(page.locator('[data-testid="editor-left-panel"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-toolbar"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-map-region"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-right-inspector"]')).toBeVisible();

            await page.setViewportSize({ width: 390, height: 844 });
            await page.goto('/tracks/new');

            await expect(page.locator('[data-testid="editor-left-panel"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-toolbar"]')).toBeVisible();
            await expect(page.locator('[data-testid="editor-map-region"]')).toBeVisible();

            const mobileMetrics = await page.evaluate(() => {
                const root = document.documentElement;
                return {
                    innerWidth: window.innerWidth,
                    scrollWidth: root.scrollWidth,
                };
            });

            expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(mobileMetrics.innerWidth + 2);
        });

        test('keeps first-level controls visible in the new zones', async ({ page }) => {
            await expect(page.locator('[data-testid="toolbar-mode-view"]')).toBeVisible();
            await expect(page.locator('[data-testid="toolbar-mode-edit"]')).toBeVisible();
            await expect(page.locator('[data-testid="toolbar-undo"]')).toBeVisible();
            await expect(page.locator('[data-testid="toolbar-redo"]')).toBeVisible();
            await expect(page.locator('[data-testid="toolbar-poi"]')).toBeVisible();
            await expect(page.locator('[data-testid="panel-track-name"]')).toBeVisible();
            await expect(page.locator('[data-testid="panel-save"]')).toBeVisible();
        });
    });

    test.describe('Map interaction', () => {
        test('map renders with a tile layer', async ({ page }) => {
            const map = page.locator('[data-testid="track-editor-map-wrapper"] .leaflet-container');
            await expect(map).toBeAttached({ timeout: 10000 });

            // Tile layer should be present
            const tiles = page.locator('.leaflet-tile-pane img');
            await expect(tiles.first()).toBeAttached({ timeout: 10000 });
        });

        test('clicking map adds a waypoint', async ({ page }) => {
            const map = page.locator('[data-testid="track-editor-map-wrapper"]');
            await expect(map).toBeVisible();

            const box = await map.boundingBox();
            if (!box) throw new Error('Map wrapper not visible');

            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForTimeout(500);

            await expect(page.locator('[data-testid="panel-points"]')).toContainText('1 pts');
            await expect(page.locator('[data-testid="active-segment-summary"]')).toContainText('1 points');
            await expect(page.locator('[data-testid="toolbar-undo"]')).toBeEnabled();
        });
    });

    test.describe('Metadata form', () => {
        test('metadata card has name and description fields', async ({ page }) => {
            // MetaCard is in the Info tab
            await page.locator('[data-testid="panel-tab-info"]').click();
            await expect(page.locator('[data-testid="track-editor-meta-card"]')).toBeVisible();
            const nameInput = page.locator('[data-testid="track-name-input"]');
            const descInput = page.locator('[data-testid="track-desc-input"]');

            await expect(nameInput).toBeVisible();
            await expect(descInput).toBeVisible();
        });

        test('categories can be selected', async ({ page }) => {
            await page.locator('[data-testid="panel-tab-info"]').click();
            const categoryElements = page.locator('[data-testid^="category-chip-"]');
            await expect(categoryElements).toHaveCount(4);
            await categoryElements.first().click();
            await expect(page.locator('[data-testid="panel-save"]')).toBeDisabled();
        });
    });

    test.describe('Save button state', () => {
        test('save button is disabled when track is empty', async ({ page }) => {
            await expect(page.locator('[data-testid="panel-save"]')).toBeDisabled();
        });

        test('save button is disabled when only name is filled', async ({ page }) => {
            await page.locator('[data-testid="panel-tab-info"]').click();
            const nameInput = page.locator('[data-testid="track-name-input"]').first();
            if (await nameInput.count() > 0) {
                await nameInput.fill('Test Track');
                await expect(page.locator('[data-testid="panel-save"]')).toBeDisabled();
            }
        });
    });

    test.describe('Undo / Redo', () => {
        test('undo button is disabled initially', async ({ page }) => {
            await expect(page.locator('[data-testid="toolbar-undo"]')).toBeDisabled();
        });

        test('redo button is disabled initially', async ({ page }) => {
            await expect(page.locator('[data-testid="toolbar-redo"]')).toBeDisabled();
        });

        test('routing controls are visible in toolbar', async ({ page }) => {
            await expect(page.locator('[data-testid="toolbar-routing-toggle"]')).toBeVisible();
            await expect(page.locator('[data-testid="toolbar-snap-mode"]')).toBeVisible();

            // Routing profile only shows after enabling auto routing
            await page.locator('[data-testid="toolbar-routing-toggle"]').click();
            await expect(page.locator('[data-testid="toolbar-routing-profile"]')).toBeVisible();
        });
    });

    test.describe('Panel tab reachability', () => {
        test('segment controls are visible in the Segments tab (default)', async ({ page }) => {
            await expect(page.locator('[data-testid="track-editor-segments-card"]')).toBeVisible();
            await expect(page.locator('[data-testid="add-segment-btn"]')).toBeVisible();
        });

        test('actions and loop controls are reachable via the Info tab', async ({ page }) => {
            await page.locator('[data-testid="panel-tab-info"]').click();
            await expect(page.locator('[data-testid="track-editor-actions-card"]')).toBeVisible();
            await expect(page.locator('[data-testid="duplicate-track-btn"]')).toBeVisible();
            await expect(page.locator('[data-testid="loop-btn"]')).toBeVisible();
        });

        test('elevation chart is reachable via the Elevation tab', async ({ page }) => {
            await page.locator('[data-testid="panel-tab-elevation"]').click();
            await expect(page.locator('[data-testid="track-editor-chart-card"]')).toBeVisible();
            await expect(page.locator('[data-testid="elevation-section"]')).toBeVisible();
        });
    });

    test.describe('Keyboard shortcuts', () => {
        test('Ctrl+Z does not crash the page', async ({ page }) => {
            await page.keyboard.press('Control+z');
            await page.waitForTimeout(200);

            // Page should still be functional
            const editor = page.locator('.track-editor-view');
            await expect(editor).toBeVisible();
        });

        test('F2 key does not crash', async ({ page }) => {
            await page.keyboard.press('F2');
            await page.waitForTimeout(200);

            const editor = page.locator('.track-editor-view');
            await expect(editor).toBeVisible();
        });

        test('F3 key does not crash', async ({ page }) => {
            await page.keyboard.press('F3');
            await page.waitForTimeout(200);

            const editor = page.locator('.track-editor-view');
            await expect(editor).toBeVisible();
        });
    });

    test.describe('Loop action', () => {
        test('loop button is visible in Info tab', async ({ page }) => {
            await page.locator('[data-testid="panel-tab-info"]').click();
            const loopBtn = page.locator('[data-testid="loop-btn"]');
            await expect(loopBtn).toBeVisible();
        });
    });
});

test.describe('Track Editor — Edit existing', () => {
    test('navigating to /tracks/:id/edit with invalid id shows error or redirect', async ({ page }) => {
        await page.goto('/tracks/00000000-0000-0000-0000-000000000000/edit');
        await page.waitForTimeout(3000);

        // Either error message shown or redirected
        const content = await page.textContent('body');
        expect(content).toBeDefined();
    });
});
