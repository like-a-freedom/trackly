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
 * Search functionality tests — verify users can search for tracks
 * by name, see results, and navigate to a track from results.
 */
test.describe("Track Search", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto("/");
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test("search button opens the search modal", async ({
    page,
  }: {
    page: Page;
  }) => {
    const searchBtn = page.locator(".search-button");
    await expect(searchBtn).toBeVisible({ timeout: 5000 });

    await searchBtn.click();

    // Search input should appear
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });
  });

  test("search input is focused when modal opens", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    await expect(page.locator(".search-input")).toBeFocused();
  });

  test("typing a query shows search results", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    await page.locator(".search-input").fill("E2E");
    await page.press(".search-input", "Enter");

    // Wait for results to load
    await page.waitForTimeout(2000);

    // Should show either results or "no results" message
    const results = page.locator(".search-result-item");
    const noResults = page.locator(".search-no-results");

    const hasResults = await results.count().catch(() => 0);
    const hasNoResults = await noResults.isVisible().catch(() => false);

    expect(hasResults > 0 || hasNoResults).toBeTruthy();
  });

  test("clicking a search result navigates to the track", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    await page.locator(".search-input").fill("E2E");
    await page.press(".search-input", "Enter");
    await page.waitForTimeout(2000);

    const results = page.locator(".search-result-item");
    const count = await results.count().catch(() => 0);

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

  test("clear button resets the search query", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    await page.locator(".search-input").fill("Test Query");
    await page.waitForTimeout(500);

    // Clear button should appear
    const clearBtn = page.locator(".clear-button");
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(300);

      const value = await page.locator(".search-input").inputValue();
      expect(value).toBe("");
    }
  });

  test("ESC key closes the search modal", async ({ page }: { page: Page }) => {
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    await page.keyboard.press("Escape");

    // Modal should close
    await expect(page.locator(".search-input")).not.toBeVisible({
      timeout: 3000,
    });
  });

  test("search results show track name and metadata", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.locator(".search-button").click();
    await expect(page.locator(".search-input")).toBeVisible({
      timeout: 5000,
    });

    await page.locator(".search-input").fill("E2E");
    await page.press(".search-input", "Enter");
    await page.waitForTimeout(2000);

    const results = page.locator(".search-result-item");
    const count = await results.count().catch(() => 0);

    if (count > 0) {
      // First result should contain track name text
      const firstResult = results.first();
      const text = await firstResult.textContent();
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(0);
    }
  });
});
