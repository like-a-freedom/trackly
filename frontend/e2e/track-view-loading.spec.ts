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

test.describe("Track View — Loading & Rendering", () => {
  test("loads a track by URL and renders the map with detail panel", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    // Map renders
    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 15000,
    });

    // Detail panel flyout appears
    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Track header shows a name (h2 heading)
    await expect(
      page.locator(".track-detail-flyout h2").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows error state for non-existent track", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.goto("/track/nonexistent-track-id-12345");

    // Should show error message
    await expect(page.locator(".error-message")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".error-message h2")).toContainText(
      "Track not found",
    );
  });

  test("navigates back to home from error state via Go to Home button", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.goto("/track/nonexistent-track-id-12345");
    await expect(page.locator(".error-message")).toBeVisible({ timeout: 10000 });

    await page.locator(".btn-home").click();
    await expect(page).toHaveURL("/");
  });

  test("detail panel displays track name and categories", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Track name heading
    await expect(
      page.locator(".track-detail-flyout h2").first(),
    ).toBeVisible();

    // Categories section visible
    await expect(
      page.locator(".track-detail-flyout", { hasText: "Categories" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("detail panel shows Basic info section with units toggle", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Basic info heading
    await expect(
      page.locator(".track-detail-flyout h3", { hasText: "Basic info" }),
    ).toBeVisible({ timeout: 5000 });

    // Unit toggle buttons (km/miles)
    await expect(page.locator(".unit-toggle").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("Statistics section is visible in detail panel", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Statistics heading
    await expect(
      page.locator(".track-detail-flyout", { hasText: "Statistics" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Elevation section is rendered in detail panel", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Elevation heading
    await expect(
      page.locator(".track-detail-flyout", { hasText: "Elevation" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("ESC key navigates back to home from track view", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 15000,
    });

    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/", { timeout: 5000 });
  });

  test("Close panel button navigates back to home", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Close panel button
    await page.locator(".close-button").first().click();

    await expect(page).toHaveURL("/", { timeout: 5000 });
  });

  test("Share and Export buttons are visible in detail panel header", async ({
    page,
  }: {
    page: Page;
  }) => {
    const trackId = testTracks["test-track-e2e"];
    await page.goto(`/track/${trackId}`);

    await expect(page.locator(".track-detail-flyout")).toBeVisible({
      timeout: 10000,
    });

    // Share and Export buttons
    await expect(page.locator(".share-track-btn").first()).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator(".export-gpx-btn").first()).toBeVisible({
      timeout: 3000,
    });
  });
});
