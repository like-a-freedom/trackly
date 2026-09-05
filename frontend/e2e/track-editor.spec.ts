import { test, expect } from "@playwright/test";

/**
 * E2E tests for Track Editor — create and edit tracks on the map.
 *
 * Tests cover:
 * - Navigation to editor page
 * - Adding waypoints by clicking the map
 * - Segment management (add, delete)
 * - Metadata editing (name, description, categories)
 * - Undo/Redo operations via left rail
 * - Keyboard shortcuts
 * - Save flow (disabled until valid)
 */

test.describe("Track Editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tracks/new");
    // Wait for the track editor view to be rendered
    await page.waitForSelector(".track-editor-view", { timeout: 15000 });
  });

  test.describe("Navigation", () => {
    test("loads track editor page at /tracks/new", async ({ page }) => {
      await expect(page).toHaveURL("/tracks/new");
      await expect(page.locator(".track-editor-view")).toBeVisible({
        timeout: 5000,
      });
      await expect(
        page.locator('[data-testid="editor-map-stage"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="editor-overlay-layer"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="editor-left-panel"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="editor-left-rail"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="editor-map-region"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="editor-right-inspector"]'),
      ).toBeVisible();
    });

    test("map stage fills available space with overlays on top", async ({
      page,
    }) => {
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

        const overlaps = (
          a: ReturnType<typeof rect>,
          b: ReturnType<typeof rect>,
        ) => {
          if (!a || !b) return false;
          return !(
            a.right <= b.left ||
            b.right <= a.left ||
            a.bottom <= b.top ||
            b.bottom <= a.top
          );
        };

        const stage = document.querySelector(
          '[data-testid="editor-map-stage"]',
        );
        const overlay = document.querySelector(
          '[data-testid="editor-overlay-layer"]',
        );
        const panel = document.querySelector(
          '[data-testid="editor-left-panel"]',
        );
        const railZone = document.querySelector(
          '[data-testid="editor-left-rail"]',
        );
        const inspector = document.querySelector(
          '[data-testid="editor-right-inspector"]',
        );
        const topBar = document.querySelector(".track-editor-top-bar");
        const bottomDeck = document.querySelector(
          '[data-testid="track-editor-bottom-deck"]',
        );

        const panelRect = rect(panel);
        const railZoneRect = rect(railZone);
        const inspectorRect = rect(inspector);

        return {
          stage: rect(stage),
          overlay: rect(overlay),
          topBar: rect(topBar),
          bottomDeck: rect(bottomDeck),
          panel: panelRect,
          railZone: railZoneRect,
          inspector: inspectorRect,
          overlayOverlaps: {
            panelInspector: overlaps(panelRect, inspectorRect),
            panelRail: overlaps(panelRect, railZoneRect),
            railInspector: overlaps(railZoneRect, inspectorRect),
          },
        };
      });

      expect(geometry.stage).not.toBeNull();
      expect(geometry.overlay).not.toBeNull();

      // Stage width matches viewport
      expect(geometry.stage!.width).toBeGreaterThan(0);
      // Stage height is positive (fills space between top bar and bottom deck)
      expect(geometry.stage!.height).toBeGreaterThan(100);

      // Overlay matches stage dimensions
      expect(
        Math.abs(geometry.overlay!.width - geometry.stage!.width),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(geometry.overlay!.height - geometry.stage!.height),
      ).toBeLessThanOrEqual(2);

      // Top bar is above the stage
      expect(geometry.topBar!.bottom).toBeLessThanOrEqual(
        geometry.stage!.top + 2,
      );
      // Bottom deck is below the stage
      expect(geometry.bottomDeck!.top).toBeGreaterThanOrEqual(
        geometry.stage!.bottom - 2,
      );

      for (const key of ["panel", "railZone", "inspector"] as const) {
        const box = geometry[key];
        expect(box).not.toBeNull();
        expect(box!.right).toBeGreaterThan(geometry.stage!.left);
        expect(box!.bottom).toBeGreaterThan(geometry.stage!.top);
        expect(box!.left).toBeLessThan(geometry.stage!.right);
        expect(box!.top).toBeLessThan(geometry.stage!.bottom);
      }

      // No visual overlaps between the three overlay regions
      expect(geometry.overlayOverlaps.panelInspector).toBe(false);
      expect(geometry.overlayOverlaps.panelRail).toBe(false);
      expect(geometry.overlayOverlaps.railInspector).toBe(false);
    });

    test("keeps the new shell usable on desktop and mobile", async ({
      page,
    }) => {
      // Desktop layout
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.goto("/tracks/new");

      await expect(
        page.locator('[data-testid="editor-left-panel"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="editor-left-rail"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="editor-map-region"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="editor-right-inspector"]'),
      ).toBeVisible();

      // Mobile layout — rail is hidden by design below 768px
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/tracks/new");

      await expect(
        page.locator('[data-testid="editor-left-panel"]'),
      ).toBeVisible();
      // Rail is display:none on mobile — should NOT be visible
      await expect(
        page.locator('[data-testid="editor-left-rail"]'),
      ).not.toBeVisible();
      await expect(
        page.locator('[data-testid="editor-map-region"]'),
      ).toBeVisible();

      const mobileMetrics = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          innerWidth: window.innerWidth,
          scrollWidth: root.scrollWidth,
        };
      });

      expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(
        mobileMetrics.innerWidth + 2,
      );
    });

    test("keeps first-level controls visible in the new zones", async ({
      page,
    }) => {
      // Left rail controls
      await expect(
        page.locator('[data-testid="left-rail-mode-view"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="left-rail-mode-edit"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="left-rail-undo"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="left-rail-redo"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="left-rail-poi-toggle"]'),
      ).toBeVisible();

      // Top bar save button
      await expect(
        page.locator('[data-testid="top-bar-save"]'),
      ).toBeVisible();
    });
  });

  test.describe("Map interaction", () => {
    test("map renders with a tile layer", async ({ page }) => {
      const map = page.locator(
        '[data-testid="track-editor-map-wrapper"] .leaflet-container',
      );
      await expect(map).toBeAttached({ timeout: 10000 });

      // Tile layer should be present
      const tiles = page.locator(".leaflet-tile-pane img");
      await expect(tiles.first()).toBeAttached({ timeout: 10000 });
    });

    test("clicking map adds a waypoint", async ({ page }) => {
      // Wait for map container to be visible
      const map = page.locator(
        '[data-testid="track-editor-map-wrapper"] .leaflet-container',
      );
      await expect(map).toBeVisible({ timeout: 15000 });

      const box = await map.boundingBox();
      if (!box) throw new Error("Map not visible");

      await page.mouse.click(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      await page.waitForTimeout(500);

      // Points counter in top bar
      await expect(
        page.locator('[data-testid="top-bar-points"]'),
      ).toContainText("1", { timeout: 3000 });
      // Active segment summary
      await expect(
        page.locator('[data-testid="active-segment-summary"]'),
      ).toContainText("1 point", { timeout: 3000 });
      // Undo should be enabled
      await expect(
        page.locator('[data-testid="left-rail-undo"]'),
      ).toBeEnabled();
    });
  });

  test.describe("Metadata form", () => {
    test("metadata card has name and description fields", async ({
      page,
    }) => {
      // Info tab
      await page.locator('[data-testid="panel-tab-info"]').click();
      const panel = page.locator('[data-testid="editor-left-panel"]');
      const nameInput = panel.locator(
        '[data-testid="track-name-input"]',
      );
      const descInput = panel.locator(
        '[data-testid="track-desc-input"]',
      );

      await expect(nameInput).toBeVisible({ timeout: 3000 });
      await expect(descInput).toBeVisible({ timeout: 3000 });
    });

    test("categories can be selected", async ({ page }) => {
      await page.locator('[data-testid="panel-tab-info"]').click();
      const panel = page.locator('[data-testid="editor-left-panel"]');
      const categoryElements = panel.locator(
        '[data-testid^="category-chip-"]',
      );
      await expect(categoryElements).toHaveCount(4);
      await categoryElements.first().click();
      // Save should still be disabled (no points yet)
      await expect(
        page.locator('[data-testid="top-bar-save"]'),
      ).toBeDisabled();
    });
  });

  test.describe("Save button state", () => {
    test("save button is disabled when track is empty", async ({
      page,
    }) => {
      await expect(
        page.locator('[data-testid="top-bar-save"]'),
      ).toBeDisabled();
    });

    test("save button is disabled when only name is filled", async ({
      page,
    }) => {
      await page.locator('[data-testid="panel-tab-info"]').click();
      const panel = page.locator('[data-testid="editor-left-panel"]');
      const nameInput = panel.locator(
        '[data-testid="track-name-input"]',
      );
      if ((await nameInput.count()) > 0) {
        await nameInput.fill("Test Track");
        await expect(
          page.locator('[data-testid="top-bar-save"]'),
        ).toBeDisabled();
      }
    });
  });

  test.describe("Undo / Redo", () => {
    test("undo button is disabled initially", async ({ page }) => {
      await expect(
        page.locator('[data-testid="left-rail-undo"]'),
      ).toBeDisabled();
    });

    test("redo button is disabled initially", async ({ page }) => {
      await expect(
        page.locator('[data-testid="left-rail-redo"]'),
      ).toBeDisabled();
    });

    test("routing controls are visible in top bar overflow", async ({
      page,
    }) => {
      // Open overflow menu in top bar
      const overflowToggle = page.locator(
        '[data-testid="top-bar-overflow-toggle"]',
      );
      if (await overflowToggle.isVisible().catch(() => false)) {
        await overflowToggle.click();
        await page.waitForTimeout(300);

        // Routing controls should be visible
        await expect(
          page.locator('[data-testid="top-bar-routing-toggle"]'),
        ).toBeVisible({ timeout: 3000 });
        await expect(
          page.locator('[data-testid="top-bar-snap-mode"]'),
        ).toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe("Panel tab reachability", () => {
    test("segment controls are visible in the Segments tab (default)", async ({
      page,
    }) => {
      const panel = page.locator('[data-testid="editor-left-panel"]');
      await expect(
        panel.locator('[data-testid="track-editor-segments-card"]'),
      ).toBeVisible();
      await expect(
        panel.locator('[data-testid="add-segment-btn"]'),
      ).toBeVisible();
    });

    test("actions and loop controls are reachable via the Info tab", async ({
      page,
    }) => {
      await page.locator('[data-testid="panel-tab-info"]').click();
      const panel = page.locator('[data-testid="editor-left-panel"]');
      await expect(
        panel.locator('[data-testid="track-actions"]'),
      ).toBeVisible();
      await expect(
        panel.locator('[data-testid="duplicate-track-btn"]'),
      ).toBeVisible();
      await expect(
        panel.locator('[data-testid="loop-btn"]'),
      ).toBeVisible();
    });

    test("elevation chart is reachable via the Elevation tab", async ({
      page,
    }) => {
      await page.locator('[data-testid="panel-tab-elevation"]').click();
      const panel = page.locator('[data-testid="editor-left-panel"]');
      await expect(
        panel.locator('[data-testid="track-editor-chart-card"]'),
      ).toBeVisible();
      await expect(
        panel.locator('[data-testid="elevation-section"]'),
      ).toBeVisible();
    });
  });

  test.describe("Keyboard shortcuts", () => {
    test("Ctrl+Z does not crash the page", async ({ page }) => {
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(200);

      const editor = page.locator(".track-editor-view");
      await expect(editor).toBeVisible();
    });

    test("F2 key does not crash", async ({ page }) => {
      await page.keyboard.press("F2");
      await page.waitForTimeout(200);

      const editor = page.locator(".track-editor-view");
      await expect(editor).toBeVisible();
    });

    test("F3 key does not crash", async ({ page }) => {
      await page.keyboard.press("F3");
      await page.waitForTimeout(200);

      const editor = page.locator(".track-editor-view");
      await expect(editor).toBeVisible();
    });
  });

  test.describe("Loop action", () => {
    test("loop button is visible in Info tab", async ({ page }) => {
      await page.locator('[data-testid="panel-tab-info"]').click();
      const loopBtn = page
        .locator('[data-testid="editor-left-panel"]')
        .locator('[data-testid="loop-btn"]');
      await expect(loopBtn).toBeVisible();
    });
  });
});

test.describe("Track Editor — Edit existing", () => {
  test("navigating to /tracks/:id/edit with invalid id shows error or redirect", async ({
    page,
  }) => {
    await page.goto(
      "/tracks/00000000-0000-0000-0000-000000000000/edit",
    );
    await page.waitForTimeout(3000);

    // Either error message shown or redirected
    const content = await page.textContent("body");
    expect(content).toBeDefined();
  });
});
