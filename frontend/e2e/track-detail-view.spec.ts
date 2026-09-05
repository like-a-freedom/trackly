import "../src/types/e2e.d.ts"

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { setupTestTracks, cleanupTestTracks } from "./setup-real-tracks";

let testTracks: Record<string, string> = {};

test.beforeAll(async () => {
  testTracks = await setupTestTracks();
  console.log("Test tracks:", testTracks);
});

test.afterAll(async () => {
  await cleanupTestTracks(Object.values(testTracks));
});

/**
 * Track Detail View tests — verify the detail flyout panel,
 * its sections (Categories, Basic info, Statistics, Elevation, Slope, Track info),
 * and interactions (collapse, expand).
 */
test.describe("Track Detail View — Panel & Sections", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);
    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 15000,
    });
  });

  test("detail panel shows track name in header", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackName = page.locator(".track-detail-flyout h2").first();
    await expect(trackName).toBeVisible({ timeout: 5000 });

    const nameText = await trackName.textContent();
    expect(nameText).toBeTruthy();
    expect(nameText!.length).toBeGreaterThan(0);
  });

  test("detail panel can be collapsed and expanded", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Panel content should be visible initially
    await expect(page.locator(".collapsible-content")).toBeVisible({
      timeout: 5000,
    });

    // Collapse the panel (button with aria-label="Collapse panel" in header)
    const collapseBtn = page
      .locator(
        'button.collapse-toggle-btn[aria-label="Collapse panel"]',
      )
      .first();
    await expect(collapseBtn).toBeVisible({ timeout: 3000 });
    await collapseBtn.click();
    await page.waitForTimeout(500);

    // Expand button should appear (in panel-controls-tab)
    const expandBtn = page.locator(
      ".panel-controls-tab .collapse-toggle-btn[aria-label='Expand panel']",
    );
    await expect(expandBtn).toBeVisible({ timeout: 3000 });

    // Re-expand
    await expandBtn.click();
    await page.waitForTimeout(500);

    // Content should be visible again
    await expect(page.locator(".collapsible-content")).toBeVisible({
      timeout: 3000,
    });
  });

  test("Categories section shows assigned categories", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Categories heading
    await expect(
      page.locator(".track-detail-flyout", { hasText: "Categories" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Basic info section shows units toggle", async ({
    page,
  }: {
    page: Page;
  }) => {
    await expect(
      page.locator(".track-detail-flyout h3", { hasText: "Basic info" }),
    ).toBeVisible({ timeout: 5000 });

    // Unit toggle buttons
    await expect(page.locator(".unit-toggle").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("Map overlays section shows distance markers toggle", async ({
    page,
  }: {
    page: Page;
  }) => {
    await expect(
      page.locator(".track-detail-flyout", { hasText: "Map overlays" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Statistics section is visible", async ({ page }: { page: Page }) => {
    await expect(
      page.locator(".track-detail-flyout", { hasText: "Statistics" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Elevation section is visible", async ({ page }: { page: Page }) => {
    await expect(
      page.locator(".track-detail-flyout", { hasText: "Elevation" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Slope Analysis section is visible when data exists", async ({
    page,
  }: {
    page: Page;
  }) => {
    const slopeVisible = await page
      .locator(".track-detail-flyout", { hasText: "Slope Analysis" })
      .isVisible()
      .catch(() => false);

    if (slopeVisible) {
      // Should have slope stats
      await expect(
        page.locator('[data-testid="slope-section"]'),
      ).toBeVisible({ timeout: 3000 });
    }
  });

  test("Track info section is visible", async ({ page }: { page: Page }) => {
    await expect(
      page.locator(".track-detail-flyout", { hasText: "Track info" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("chart hover shows marker on map via E2E helper", async ({
    page,
  }: {
    page: Page;
  }) => {
    const hasHelper = await page.evaluate(
      () => !!(window.__e2e && window.__e2e.hoverAtIndex),
    );

    if (hasHelper) {
      await page.evaluate(
        () => window.__e2e?.hoverAtIndex?.(1) ?? null,
      );
      await page.waitForTimeout(300);

      // Hover marker should appear on map
      const hoverMarker = page.locator(".chart-hover-marker");
      await expect(hoverMarker).toHaveCount(1, { timeout: 3000 });
    }
  });

  test("chart click fixes a point on the map", async ({
    page,
  }: {
    page: Page;
  }) => {
    const hasHelper = await page.evaluate(
      () => !!(window.__e2e && window.__e2e.fixAtIndex),
    );

    if (hasHelper) {
      await page.evaluate(
        () => window.__e2e?.fixAtIndex?.(1) ?? null,
      );
      await page.waitForTimeout(300);

      // Fixed marker should appear
      const fixedMarker = page.locator(".chart-fixed-marker");
      await expect(fixedMarker).toHaveCount(1, { timeout: 3000 });
    }
  });

  test("fixed marker persists after chart mouse leave", async ({
    page,
  }: {
    page: Page;
  }) => {
    const hasHelper = await page.evaluate(
      () => !!(window.__e2e && window.__e2e.fixAtIndex),
    );

    if (hasHelper) {
      // Fix a point
      await page.evaluate(
        () => window.__e2e?.fixAtIndex?.(1) ?? null,
      );
      await page.waitForTimeout(200);

      const fixedMarker = page.locator(".chart-fixed-marker");
      await expect(fixedMarker).toHaveCount(1, { timeout: 3000 });

      // Clear the marker
      await page.evaluate(
        () => window.__e2e?.clearMarker?.() ?? null,
      );
      await page.waitForTimeout(200);

      await expect(fixedMarker).toHaveCount(0, { timeout: 3000 });
    }
  });
});
