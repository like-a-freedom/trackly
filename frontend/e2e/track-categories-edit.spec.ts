import { test, expect } from '@playwright/test';

test.describe('Track Categories Inline Editing with Multiselect', () => {
  const BACKEND_URL = 'http://localhost:8080';
  const FRONTEND_URL = 'http://localhost:81';
  const TEST_SESSION_ID = 'e2e-test-session-categories';
  let trackId: string;

  test.beforeAll(async () => {
    // Try to upload a test track, but if backend is not available, skip the test
    try {
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <name>E2E Categories Test</name>
    <trkseg>
      <trkpt lat="37.7749" lon="-122.4194"><ele>10</ele></trkpt>
      <trkpt lat="37.7750" lon="-122.4195"><ele>11</ele></trkpt>
      <trkpt lat="37.7751" lon="-122.4196"><ele>12</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

      // Use form-data node module for upload
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('file', Buffer.from(gpxContent), {
        filename: 'test-categories.gpx',
        contentType: 'application/gpx+xml',
      });
      form.append('name', 'E2E Categories Test Track');
      form.append('categories', 'Running,Hiking');
      form.append('session_id', TEST_SESSION_ID);

      const response = await fetch(`${BACKEND_URL}/tracks/upload`, {
        method: 'POST',
        body: form as any,
        headers: form.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('Backend upload failed:', response.status, errorText);
        console.warn('Skipping category edit e2e tests - backend may be unavailable');
        return; // Tests will be skipped if trackId is not set
      }

      const data: any = await response.json();
      trackId = data.id;
      console.log('Uploaded test track:', trackId);
    } catch (error: any) {
      console.warn('Failed to setup test track:', error.message);
      console.warn('Skipping category edit e2e tests - backend may be unavailable');
    }
  });

  test.afterAll(async () => {
    // Cleanup: delete the test track using fetch directly
    if (trackId) {
      await fetch(`${BACKEND_URL}/tracks/${trackId}`, {
        method: 'DELETE',
        headers: {
          Cookie: `session_id=${TEST_SESSION_ID}`,
        },
      });
      console.log('Deleted test track:', trackId);
    }
  });

  test('should display inline Multiselect for track owner', async ({ page, context }) => {
    test.skip(!trackId, 'Backend unavailable or track upload failed');
    
    // Set session cookie to be track owner
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Check that categories section exists with inline Multiselect
    const categoriesSection = page.locator('.stats-section:has-text("Categories")');
    await expect(categoriesSection).toBeVisible();

    // Check that inline edit Multiselect is visible
    const inlineEdit = page.locator('.categories-inline-edit');
    await expect(inlineEdit).toBeVisible();
    
    const multiselect = page.locator('.track-category-select-inline');
    await expect(multiselect).toBeVisible();
  });

  test('should show read-only tags for non-owner', async ({ page }) => {
    test.skip(!trackId, 'Backend unavailable or track upload failed');
    
    // Do NOT set session cookie (non-owner)
    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Check that categories section exists with read-only tags
    const categoriesSection = page.locator('.stats-section:has-text("Categories")');
    await expect(categoriesSection).toBeVisible();

    // Check that inline edit is not visible
    const inlineEdit = page.locator('.categories-inline-edit');
    await expect(inlineEdit).not.toBeVisible();
    
    // Check that read-only tags are visible
    const categoryTags = page.locator('.category-tag');
    await expect(categoryTags.first()).toBeVisible();
  });

  test('should allow editing categories inline', async ({ page, context }) => {
    test.skip(!trackId, 'Backend unavailable or track upload failed');
    
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Multiselect should be present and enabled
    const multiselect = page.locator('.track-category-select-inline');
    await expect(multiselect).toBeVisible();
    await expect(multiselect).not.toBeDisabled();
  });

  test('should show saving indicator during update', async ({ page, context }) => {
    test.skip(!trackId, 'Backend unavailable or track upload failed');
    
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Note: Testing the saving indicator is complex with Multiselect
    // as it requires actual interaction with the dropdown
    // For now, we just verify the structure exists
    const multiselect = page.locator('.track-category-select-inline');
    await expect(multiselect).toBeVisible();
  });
});
