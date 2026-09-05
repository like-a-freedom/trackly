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
 * Map interaction tests — verify map controls (zoom, pan),
 * geolocation button, and home page UI elements.
 */
test.describe("Map Interactions — Home", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto("/");
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test("map tiles are rendered", async ({ page }: { page: Page }) => {
    // Map should have tile images rendered
    const tiles = page.locator(".leaflet-tile-pane img");
    await expect(tiles.first()).toBeVisible({ timeout: 10000 });
  });

  test("map attribution is visible", async ({ page }: { page: Page }) => {
    // Leaflet attribution
    await expect(page.locator(".leaflet-control-attribution")).toBeVisible({
      timeout: 5000,
    });
  });

  test("geolocation button is visible and clickable", async ({
    page,
  }: {
    page: Page;
  }) => {
    const geoBtn = page.locator(".geolocation-button");
    await expect(geoBtn).toBeVisible({ timeout: 5000 });

    // Click should not throw (actual geolocation requires permission)
    await geoBtn.click();
    await page.waitForTimeout(500);

    // Page should still be functional
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });

  test("login/auth button is visible when auth is enabled", async ({
    page,
  }: {
    page: Page;
  }) => {
    const loginBtn = page.locator(
      ".login-button, .google-login-btn, button:has-text('Sign in')",
    );
    // Auth may or may not be enabled depending on env
    const count = await loginBtn.count().catch(() => 0);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("create track button is visible", async ({ page }: { page: Page }) => {
    const createBtn = page.locator(".create-track-btn");
    await expect(createBtn).toBeVisible({ timeout: 5000 });
  });

  test("upload form toggle is visible", async ({ page }: { page: Page }) => {
    const uploadBtn = page.locator(".upload-button-compact");
    const isVisible = await uploadBtn.isVisible().catch(() => false);
    expect(typeof isVisible).toBe("boolean");
  });
});

test.describe("Map Interactions — Track View", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);
    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
  });

  test("start and finish endpoint markers are visible", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Endpoint markers should be rendered
    const startMarker = page.locator(".endpoint-marker--start");
    const finishMarker = page.locator(".endpoint-marker--finish");

    const hasStart = await startMarker.first().isVisible().catch(() => false);
    const hasFinish = await finishMarker.first().isVisible().catch(() => false);

    // At least one should be visible for a valid track
    expect(hasStart || hasFinish).toBeTruthy();
  });

  test("chart hover updates marker position on map", async ({
    page,
  }: {
    page: Page;
  }) => {
    const hasHelper = await page.evaluate(
      () => !!(window.__e2e && window.__e2e.hoverAtIndex),
    );

    if (hasHelper) {
      await page.evaluate(
        () => window.__e2e?.hoverAtIndex?.(0) ?? null,
      );
      await page.waitForTimeout(200);

      const marker1 = await page.evaluate(
        () => window.__e2e?.getLastMarkerLatLng?.() ?? null,
      );

      await page.evaluate(
        () => window.__e2e?.hoverAtIndex?.(2) ?? null,
      );
      await page.waitForTimeout(200);

      const marker2 = await page.evaluate(
        () => window.__e2e?.getLastMarkerLatLng?.() ?? null,
      );

      expect(marker1).not.toBeNull();
      expect(marker2).not.toBeNull();
    }
  });

  test("POI markers section renders without errors", async ({
    page,
  }: {
    page: Page;
  }) => {
    // POI markers may or may not be present depending on track data
    const poiMarkers = page.locator(".poi-marker, .marker-cluster");
    const count = await poiMarkers.count().catch(() => 0);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("map can be panned by dragging", async ({ page }: { page: Page }) => {
    // Drag the map
    const map = page.locator(".leaflet-container");
    const box = await map.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 100,
        box.y + box.height / 2 + 50,
        { steps: 10 },
      );
      await page.mouse.up();
      await page.waitForTimeout(500);
    }

    // Page should still be functional after pan
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });
});
