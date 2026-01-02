import { test, expect } from '@playwright/test';

test.describe('Track Categories Editing', () => {
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

  test('should display edit categories button for track owner', async ({ page, context }) => {
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

    // Navigate to track detail page
    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');

    // Wait for track detail panel to load
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Check that categories section exists
    const categoriesSection = page.locator('.stats-section:has-text("Categories")');
    await expect(categoriesSection).toBeVisible();

    // Check that edit button is visible for owner
    const editButton = page.locator('.edit-categories-btn');
    await expect(editButton).toBeVisible();
    await expect(editButton).toHaveText('Edit categories');
  });

  test('should enter edit mode when edit button is clicked', async ({ page, context }) => {
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

    // Click edit button
    await page.click('.edit-categories-btn');

    // Check that edit mode UI is visible
    await expect(page.locator('.categories-edit')).toBeVisible();
    await expect(page.locator('.add-category-input')).toBeVisible();
    await expect(page.locator('.add-category-btn')).toBeVisible();

    // Check that existing categories are shown as editable tags
    const editableTags = page.locator('.category-tag.editable');
    await expect(editableTags).toHaveCount(2); // Running, Hiking

    // Check that remove buttons are present
    const removeButtons = page.locator('.remove-tag');
    await expect(removeButtons).toHaveCount(2);
  });

  test('should add a new category', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Enter edit mode
    await page.click('.edit-categories-btn');
    await expect(page.locator('.categories-edit')).toBeVisible();

    // Type new category
    await page.fill('.add-category-input', 'Trail');

    // Click Add button
    await page.click('.add-category-btn');

    // Check that new category appears in the list
    await expect(page.locator('.category-tag.editable:has-text("Trail")')).toBeVisible();

    // Cancel to avoid saving
    await page.click('.categories-edit .cancel-btn');
  });

  test('should add category by pressing Enter', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    await page.click('.edit-categories-btn');
    await expect(page.locator('.categories-edit')).toBeVisible();

    // Type and press Enter
    await page.fill('.add-category-input', 'Mountain');
    await page.press('.add-category-input', 'Enter');

    // Check that new category appears
    await expect(page.locator('.category-tag.editable:has-text("Mountain")')).toBeVisible();

    await page.click('.categories-edit .cancel-btn');
  });

  test('should remove a category', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    await page.click('.edit-categories-btn');
    await expect(page.locator('.categories-edit')).toBeVisible();

    // Get initial count
    const initialCount = await page.locator('.category-tag.editable').count();

    // Click first remove button
    await page.locator('.remove-tag').first().click();

    // Check that count decreased
    const newCount = await page.locator('.category-tag.editable').count();
    expect(newCount).toBe(initialCount - 1);

    await page.click('.categories-edit .cancel-btn');
  });

  test('should validate empty categories', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    await page.click('.edit-categories-btn');
    await expect(page.locator('.categories-edit')).toBeVisible();

    // Remove all categories
    const removeButtons = page.locator('.remove-tag');
    const count = await removeButtons.count();
    for (let i = 0; i < count; i++) {
      await removeButtons.first().click();
    }

    // Try to save
    await page.click('.categories-edit .save-btn');

    // Check for error message
    await expect(page.locator('.edit-error')).toBeVisible();
    await expect(page.locator('.edit-error')).toContainText('At least one category is required');

    await page.click('.categories-edit .cancel-btn');
  });

  test('should validate duplicate categories', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    await page.click('.edit-categories-btn');
    await expect(page.locator('.categories-edit')).toBeVisible();

    // Try to add existing category
    await page.fill('.add-category-input', 'Running');
    await page.click('.add-category-btn');

    // Check for error message
    await expect(page.locator('.edit-error')).toBeVisible();
    await expect(page.locator('.edit-error')).toContainText('already added');

    await page.click('.categories-edit .cancel-btn');
  });

  test('should save categories successfully', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    await page.click('.edit-categories-btn');
    await expect(page.locator('.categories-edit')).toBeVisible();

    // Add new category
    await page.fill('.add-category-input', 'TestCategory');
    await page.press('.add-category-input', 'Enter');

    // Save
    await page.click('.categories-edit .save-btn');

    // Wait for save to complete
    await page.waitForSelector('.categories-edit', { state: 'hidden', timeout: 5000 });

    // Check that we're back in display mode
    await expect(page.locator('.categories-edit')).not.toBeVisible();

    // Check that new category is displayed
    await expect(page.locator('.category-tag:has-text("TestCategory")')).toBeVisible();

    // Check for success toast (optional, if you have toast notifications)
    // await expect(page.locator('.toast:has-text("Categories updated")')).toBeVisible();
  });

  test('should cancel edit without saving', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Get initial categories
    const initialCategories = await page.locator('.category-tag').allTextContents();

    await page.click('.edit-categories-btn');
    await expect(page.locator('.categories-edit')).toBeVisible();

    // Make changes
    await page.fill('.add-category-input', 'TempCategory');
    await page.click('.add-category-btn');
    await expect(page.locator('.category-tag.editable:has-text("TempCategory")')).toBeVisible();

    // Cancel
    await page.click('.categories-edit .cancel-btn');

    // Check that we're back in display mode
    await expect(page.locator('.categories-edit')).not.toBeVisible();

    // Check that original categories are still there (no TempCategory)
    const finalCategories = await page.locator('.category-tag').allTextContents();
    expect(finalCategories).toEqual(initialCategories);
    expect(finalCategories.join(',')).not.toContain('TempCategory');
  });

  test('should show proper icons in edit mode', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    await page.click('.edit-categories-btn');
    await expect(page.locator('.categories-edit')).toBeVisible();

    // Check for icons in buttons
    await expect(page.locator('.add-category-btn svg')).toBeVisible();
    await expect(page.locator('.categories-edit .save-btn svg')).toBeVisible();
    await expect(page.locator('.categories-edit .cancel-btn svg')).toBeVisible();

    // Check for remove icons on tags
    const removeTags = page.locator('.remove-tag svg');
    expect(await removeTags.count()).toBeGreaterThan(0);

    await page.click('.categories-edit .cancel-btn');
  });

  test('should not show edit button for non-owner', async ({ page }) => {
    // Don't set session cookie to simulate non-owner
    await page.goto(`/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Check that categories section exists but edit button doesn't
    const categoriesSection = page.locator('.stats-section:has-text("Categories")');
    await expect(categoriesSection).toBeVisible();

    const editButton = page.locator('.edit-categories-btn');
    await expect(editButton).not.toBeVisible();
  });
});
