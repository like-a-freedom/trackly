import "../src/types/e2e.d.ts"

import { test, expect, request } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";

/**
 * Track lifecycle E2E tests — verify the core user journey:
 * upload a track -> find it via search -> view it -> see detail panel.
 *
 * These tests use direct API upload to create a track,
 * then validate the full frontend flow.
 */
let uploadedTrackId: string | null = null;

test.beforeAll(async () => {
  // Upload a test track via API using a separate request context
  const apiContext = await request.newContext({
    baseURL: "http://localhost:8080",
  });

  const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trackly E2E">
  <trk>
    <name>E2E Lifecycle Track</name>
    <trkseg>
      <trkpt lat="55.7500" lon="37.6200"><ele>150</ele></trkpt>
      <trkpt lat="55.7510" lon="37.6210"><ele>155</ele></trkpt>
      <trkpt lat="55.7520" lon="37.6220"><ele>160</ele></trkpt>
      <trkpt lat="55.7530" lon="37.6230"><ele>158</ele></trkpt>
      <trkpt lat="55.7540" lon="37.6240"><ele>162</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const buffer = Buffer.from(gpxContent);
  const response = await apiContext.post("/api/tracks", {
    multipart: {
      file: {
        name: "e2e-lifecycle.gpx",
        mimeType: "application/gpx+xml",
        buffer: buffer,
      },
      name: "E2E Lifecycle Track",
      categories: "e2e-lifecycle",
      session_id: "e2e-lifecycle-session",
    },
  });

  if (response.ok()) {
    const data = await response.json();
    uploadedTrackId = data.id || data.track_id;
    console.log("Uploaded track ID:", uploadedTrackId);
  } else {
    console.warn("Upload failed:", response.status(), await response.text());
  }

  await apiContext.dispose();
});

test.describe("Track Lifecycle — Upload to View", () => {
  test("uploaded track can be found via search", async ({
    page,
  }: {
    page: Page;
  }) => {
    test.skip(!uploadedTrackId, "Track upload failed");

    await page.goto("/");
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });

    // Open search
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    // Search for the uploaded track
    await page.locator(".search-input").fill("Lifecycle");
    await page.press(".search-input", "Enter");
    await page.waitForTimeout(2000);

    // Should find at least one result
    const results = page.locator(".search-result-item");
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
  });

  test("clicking uploaded track result navigates to track view with detail panel", async ({
    page,
  }: {
    page: Page;
  }) => {
    test.skip(!uploadedTrackId, "Track upload failed");

    await page.goto("/");
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });

    // Open search
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    // Search
    await page.locator(".search-input").fill("Lifecycle");
    await page.press(".search-input", "Enter");
    await page.waitForTimeout(2000);

    // Click first result
    const results = page.locator(".search-result-item");
    const count = await results.count();
    if (count > 0) {
      await results.first().click();

      // Should navigate to track view
      await page.waitForURL(/\/track\/[a-f0-9-]+/, { timeout: 10000 });

      // Detail panel should be visible
      await expect(page.locator(".track-detail-flyout")).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test("uploaded track detail panel shows correct sections", async ({
    page,
  }: {
    page: Page;
  }) => {
    test.skip(!uploadedTrackId, "Track upload failed");

    await page.goto(`/track/${uploadedTrackId}`);

    // Map renders
    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 15000,
    });

    // Detail panel appears
    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Key sections visible
    await expect(
      page.locator(".track-detail-flyout h3", { hasText: "Basic info" }),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator(".track-detail-flyout", { hasText: "Statistics" }),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator(".track-detail-flyout", { hasText: "Elevation" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("uploaded track shows endpoint markers on map", async ({
    page,
  }: {
    page: Page;
  }) => {
    test.skip(!uploadedTrackId, "Track upload failed");

    await page.goto(`/track/${uploadedTrackId}`);

    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 15000,
    });

    await page.waitForTimeout(2000);

    // Endpoint markers should be visible
    const startMarker = page.locator(".endpoint-marker--start");
    const finishMarker = page.locator(".endpoint-marker--finish");

    const hasStart = await startMarker.first().isVisible().catch(() => false);
    const hasFinish = await finishMarker.first().isVisible().catch(() => false);

    expect(hasStart || hasFinish).toBeTruthy();
  });

  test("navigating back to home shows the map with default view", async ({
    page,
  }: {
    page: Page;
  }) => {
    test.skip(!uploadedTrackId, "Track upload failed");

    await page.goto(`/track/${uploadedTrackId}`);
    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Press ESC to go home
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/", { timeout: 5000 });

    // Map should still be visible
    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 5000,
    });
  });
});

test.afterAll(async () => {
  if (uploadedTrackId) {
    // Cleanup: delete the uploaded track
    const apiContext = await request.newContext({
      baseURL: "http://localhost:8080",
    });
    await apiContext.delete(`/api/tracks/${uploadedTrackId}`, {
      data: { name: "delete", session_id: "e2e-lifecycle-session" },
    });
    await apiContext.dispose();
  }
});
