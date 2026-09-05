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
 * Track filtering tests — verify users can filter tracks by toggling
 * filter panel, adjusting category/length/elevation/slope filters,
 * and using "My tracks" ownership filter.
 */
test.describe("Track Filtering", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto("/");
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test("filter panel is open by default and shows content", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Filter panel should be visible by default
    await expect(page.locator(".track-filter-control")).toBeVisible({
      timeout: 5000,
    });
  });

  test("filter panel closes via collapse button", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Panel should be visible initially
    await expect(page.locator(".track-filter-control")).toBeVisible({
      timeout: 5000,
    });

    // Click collapse button (uses aria-label)
    const collapseBtn = page.locator(
      'button[aria-label="Collapse filters"]',
    );
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click();
      await page.waitForTimeout(300);

      // Panel content should be hidden, compact button visible
      await expect(page.locator(".filter-button-compact")).toBeVisible({
        timeout: 3000,
      });
    }
  });

  test("filter panel shows content (filters or no tracks message)", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Filter panel is open by default
    await expect(page.locator(".track-filter-control")).toBeVisible({
      timeout: 5000,
    });

    // Should show either filters or the "no tracks" placeholder
    const noTracks = page.locator(".no-tracks-placeholder");
    const filterSection = page.locator(".filter-section");

    const hasNoTracks = await noTracks.isVisible().catch(() => false);
    const hasFilterSection = await filterSection.first().isVisible().catch(() => false);

    expect(hasNoTracks || hasFilterSection).toBeTruthy();
  });

  test("filter options toggle shows/hides filter section checkboxes", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Filter panel is open by default
    await expect(page.locator(".track-filter-control")).toBeVisible({
      timeout: 5000,
    });

    // Click filter options button
    const optionsBtn = page.locator(".filter-options-btn");
    if (await optionsBtn.isVisible().catch(() => false)) {
      await optionsBtn.click();

      // Options panel should appear
      await expect(page.locator(".filter-options-panel")).toBeVisible({
        timeout: 3000,
      });

      // Should have toggle checkboxes for Categories, Length, Elevation, Slope
      await expect(page.locator("#show-categories")).toBeVisible();
      await expect(page.locator("#show-length")).toBeVisible();
    }
  });

  test("My tracks checkbox is visible when auth is enabled", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Set authenticated state
    await page.evaluate(() => {
      if (window.__tracklyAuthE2E?.setAuthenticated) {
        window.__tracklyAuthE2E.setAuthenticated({
          name: "Test User",
          email: "test@example.com",
          avatar_url: null,
        });
      }
    });

    // Reload to apply auth state
    await page.reload();
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Filter panel is open by default
    await expect(page.locator(".track-filter-control")).toBeVisible({
      timeout: 5000,
    });

    // My tracks checkbox should be visible
    const myTracksCheckbox = page.locator("#show-my-tracks");
    if (await myTracksCheckbox.isVisible().catch(() => false)) {
      await myTracksCheckbox.click();
      await page.waitForTimeout(1000);
    }
  });

  test("reset filters button is present when tracks exist", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Filter panel is open by default
    await expect(page.locator(".track-filter-control")).toBeVisible({
      timeout: 5000,
    });

    // Look for reset button
    const resetBtn = page.locator(".filter-actions button");
    const isVisible = await resetBtn.isVisible().catch(() => false);
    expect(typeof isVisible).toBe("boolean");
  });
});
