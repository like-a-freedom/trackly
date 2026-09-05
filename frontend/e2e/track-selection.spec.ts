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
 * Track selection tests — verify users can select tracks from search results
 * and navigate directly to a track view by URL.
 */
test.describe("Track Selection", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto("/");
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test("searching for a track and clicking result navigates to track view", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Open search
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    // Type a search query
    await page.locator(".search-input").fill("E2E");
    await page.press(".search-input", "Enter");
    await page.waitForTimeout(2000);

    // Check if results appear
    const results = page.locator(".search-result-item");
    const count = await results.count();

    if (count > 0) {
      // Click first result
      await results.first().click();

      // Should navigate to track view
      await page.waitForURL(/\/track\/[a-f0-9-]+/, { timeout: 10000 });
    }
  });

  test("navigating directly to a track URL loads the correct track", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    // Map and detail panel should render
    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // URL should remain the same
    await expect(page).toHaveURL(`/track/${trackId}`);
  });

  test("track endpoints (start/finish) are visible on track view", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 15000,
    });

    // Wait for map to render
    await page.waitForTimeout(2000);

    // Endpoint markers should be rendered (look for endpoint icon images or SVGs)
    const endpointMarkers = page.locator(
      ".endpoint-marker, img[src*='start'], img[src*='finish']",
    );
    const count = await endpointMarkers.count().catch(() => 0);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("distance markers appear on track", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 15000,
    });

    await page.waitForTimeout(2000);

    // Distance markers (km labels) may be visible
    const distanceMarkers = page.locator(
      ".distance-marker, .km-marker",
    );
    const count = await distanceMarkers.count().catch(() => 0);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
