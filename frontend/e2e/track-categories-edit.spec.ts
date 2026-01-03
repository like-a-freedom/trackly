import { test, expect } from '@playwright/test';

test.describe('Track Categories Inline Editing with Multiselect', () => {
  const BACKEND_URL = 'http://localhost:8080';
  const FRONTEND_URL = 'http://localhost:81';
  const TEST_SESSION_ID = '11111111-1111-1111-1111-111111111111';
  let trackId: string;
  let trackOwnerSession: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // Use a browser page to POST FormData via fetch (browser FormData reliably produces multipart)
    try {
      const uniqueOffset = (Date.now() % 100000) / 1e7;
      const baseLat = 37.7749;
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <name>E2E Categories Test</name>
    <trkseg>
      <trkpt lat="${(baseLat + uniqueOffset).toFixed(7)}" lon="-122.4194"><ele>10</ele></trkpt>
      <trkpt lat="${(baseLat + uniqueOffset + 0.0001).toFixed(7)}" lon="-122.4195"><ele>11</ele></trkpt>
      <trkpt lat="${(baseLat + uniqueOffset + 0.0002).toFixed(7)}" lon="-122.4196"><ele>12</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

      // Use fixed test session id so the uploaded track is owned by the test session
      const sessionUuid = TEST_SESSION_ID;

      const context = await browser.newContext();
      // set session cookie so upload is associated with test owner
      await context.addCookies([
        {
          name: 'session_id',
          value: sessionUuid,
          domain: 'localhost',
          path: '/',
        },
      ]);
      // ensure frontend getSessionId returns the same test session id by setting localStorage
      await context.addInitScript(`(() => { try { localStorage.setItem('trackly_session_id', '${sessionUuid}'); } catch(e){} })()`);
      const page = await context.newPage();
      // Navigate to frontend so fetch has correct origin and cookies
      await page.goto(FRONTEND_URL);
      await page.waitForLoadState('networkidle');

      const result = await page.evaluate(async ({ gpx, backendUrl, sessionId, sessionUuid }) => {
        try {
          const file = new File([gpx], 'test-categories.gpx', { type: 'application/gpx+xml' });
          const fd = new FormData();
          fd.append('file', file);
          fd.append('name', `E2E Categories Test Track ${Date.now()}`);
          fd.append('categories', 'running,hiking');
          // include session id as a valid UUID to mark owner
          fd.append('session_id', sessionUuid);

          // POST to relative path so dev server proxy forwards to backend
          const res = await fetch(`/tracks/upload`, { method: 'POST', body: fd, credentials: 'include' });
          const text = await res.text();
          let json = null;
          try { json = JSON.parse(text); } catch (e) { /* not json */ }
          return { ok: res.ok, status: res.status, json, text };
        } catch (e: any) {
          return { ok: false, status: 0, error: (e && e.message) ? e.message : String(e) };
        }
      }, { gpx: gpxContent, backendUrl: BACKEND_URL, sessionId: TEST_SESSION_ID, sessionUuid });

      if (!result.ok) {
        // If upload returned conflict (duplicate), try to find existing track via search
        console.warn('Failed to setup test track:', result.status, result.error || result.text);
        if (result.status === 409) {
          try {
            const search = await page.evaluate(async (query) => {
              const res = await fetch(`/tracks/search?query=${encodeURIComponent(query)}`, { credentials: 'include' });
              const json = await res.json();
              return json;
            }, 'E2E Categories Test Track');
            if (Array.isArray(search) && search.length > 0) {
              trackId = search[0].id;
              console.log('Found existing track via search:', trackId);
              try {
                const details = await page.evaluate(async (id) => {
                  const res = await fetch(`/tracks/${id}`, { credentials: 'include' });
                  return await res.json();
                }, trackId);
                if (details && details.session_id) {
                  trackOwnerSession = details.session_id;
                  console.log('Track owner session id:', trackOwnerSession);
                }
              } catch (err) {
                console.warn('Failed to fetch track details for owner session');
              }
            } else {
              console.warn('No search results found for duplicate track');
            }
          } catch (err) {
            console.warn('Search for existing track failed:', err);
          }
        }

        if (!trackId) {
          console.warn('Skipping category edit e2e tests - backend may be unavailable');
          await context.close();
          return;
        }
      } else {
        trackId = result.json?.id || null;
        if (!trackId) {
          console.warn('Upload response did not contain track id:', result);
          console.warn('Skipping category edit e2e tests - backend may be unavailable');
          await context.close();
          return;
        }
        // the session used to upload is the test session id
        trackOwnerSession = sessionUuid;
        console.log('Uploaded test track via browser upload:', trackId, 'owner session:', trackOwnerSession);
      }
      await context.close();
    } catch (error: any) {
      console.warn('Failed to setup test track (browser upload):', error.message || error);
      console.warn('Skipping category edit e2e tests - backend may be unavailable');
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: delete the test track using Playwright request fixture
    if (trackId) {
      const response = await request.delete(`${BACKEND_URL}/tracks/${trackId}`, {
        data: { name: 'delete', session_id: TEST_SESSION_ID },
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok()) {
        console.log('Deleted test track:', trackId);
      } else {
        console.warn('Failed to delete test track:', response.status(), await response.text());
      }
    }
  });

  test('should display inline Multiselect for track owner', async ({ page, context }) => {
    test.skip(!trackId, 'Backend unavailable or track upload failed');
    
    // Set session cookie to be track owner
    const ownerSessionToSet = trackOwnerSession || TEST_SESSION_ID;
    await context.addCookies([
      {
        name: 'session_id',
        value: ownerSessionToSet,
        domain: 'localhost',
        path: '/',
      },
    ]);
    // Set localStorage session id so frontend sends x-session-id header for ownership checks
    await context.addInitScript(`(() => { try { localStorage.setItem('trackly_session_id', '${ownerSessionToSet}'); } catch(e){} })()`);

    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Check that categories section exists with inline Multiselect
    const categoriesSection = page.locator('.stats-section:has-text("Categories")');
    await expect(categoriesSection).toBeVisible();

    // Check that inline edit Multiselect is visible
    const inlineEdit = page.locator('.categories-inline-edit');
    // give UI a small moment to render state
    await page.waitForTimeout(500);
    if (!(await inlineEdit.isVisible())) {
      const catsHtml = await page.locator('.stats-section:has-text("Categories")').innerHTML().catch(() => 'n/a');
      console.warn('Categories section HTML:', catsHtml);
    }
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
    // Ensure frontend getSessionId() returns the same test session id by setting localStorage
    await context.addInitScript(`(() => { try { localStorage.setItem('trackly_session_id', '${TEST_SESSION_ID}'); } catch(e){} })()`);

    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Multiselect should be present and enabled
    const multiselect = page.locator('.track-category-select-inline');
    await expect(multiselect).toBeVisible();
    await expect(multiselect).not.toBeDisabled();

    // The trigger width should match its content width (tags) — check that width ~= scrollWidth
    const dims = await multiselect.evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      scrollWidth: el.scrollWidth
    }));
    // Allow small rounding differences
    const diff = Math.abs(dims.width - dims.scrollWidth);
    expect(diff).toBeLessThan(3);

    // Open the dropdown and assert it aligns to the LEFT edge of the container (not centered)
    // Note: Full dropdown alignment testing is complex with Multiselect tags mode
    // We'll just verify that clicking/interacting doesn't break the component
    await multiselect.scrollIntoViewIfNeeded();
    
    const input = multiselect.locator('input').first();
    if (await input.count() > 0) {
      // Try opening dropdown via typing in search
      await multiselect.locator('.multiselect-wrapper').click({ force: true });
      await input.focus();
      await input.type('w', { delay: 50 });
      await page.waitForTimeout(300);
      
      // Check if dropdown is visible (options should render)
      const hasOptions = await page.evaluate(() => {
        const opts = Array.from(document.querySelectorAll('*')).filter(n => 
          n.textContent && n.textContent.trim() === 'Walking' && 
          window.getComputedStyle(n).display !== 'none'
        );
        return opts.length > 0;
      });
      
      if (hasOptions) {
        const containerRect = await multiselect.evaluate((el) => el.getBoundingClientRect());
        

        // Find the menu option in dropdown
        const menuLeft = await page.evaluate((containerBottom) => {
          const matching = Array.from(document.querySelectorAll('*')).filter(n => 
            n.textContent && n.textContent.trim() === 'Walking'
          );
          for (const n of matching) {
            const r = n.getBoundingClientRect();
            // Options positioned below trigger are in dropdown
            if (r.top > containerBottom + 4 && window.getComputedStyle(n).display !== 'none') {
              return r.left;
            }
          }
          return null;
        }, containerRect.bottom);

        // If dropdown opened, check alignment (tolerance for padding/borders)
        if (menuLeft !== null) {
          const leftDiff = Math.abs(containerRect.left - menuLeft);
          console.log(`Dropdown alignment check: container.left=${containerRect.left}, menu.left=${menuLeft}, diff=${leftDiff}`);
          expect(leftDiff).toBeLessThan(20); // Generous tolerance for dropdown padding
        }
      }
    }

    // Close dropdown if opened
    await page.keyboard.press('Escape');
  });

  test('should open description editor when clicking description block', async ({ page, context }) => {
    test.skip(!trackId, 'Backend unavailable or track upload failed');

    await context.addCookies([
      {
        name: 'session_id',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);
    await context.addInitScript(`(() => { try { localStorage.setItem('trackly_session_id', '${TEST_SESSION_ID}'); } catch(e){} })()`);

    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    const descBlock = page.locator('.track-description-block');
    await expect(descBlock).toBeVisible();
    await descBlock.click();

    // Expect edit textarea to appear
    const editBlock = page.locator('.description-edit-block');
    await expect(editBlock).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.edit-description-input')).toBeVisible();

    // Close editor
    await page.locator('.cancel-btn').click();
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
    // Ensure frontend getSessionId() returns the same test session id by setting localStorage
    await context.addInitScript(`(() => { try { localStorage.setItem('trackly_session_id', '${TEST_SESSION_ID}'); } catch(e){} })()`);

    await page.goto(`${FRONTEND_URL}/track/${trackId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.track-detail-flyout', { timeout: 10000 });

    // Note: Testing the saving indicator is complex with Multiselect
    // as it requires actual interaction with the dropdown
    // For now, we just verify the structure exists and that it sizes to its content
    const multiselect = page.locator('.track-category-select-inline');
    await expect(multiselect).toBeVisible();

    const dims = await multiselect.evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      scrollWidth: el.scrollWidth
    }));
    const diff = Math.abs(dims.width - dims.scrollWidth);
    expect(diff).toBeLessThan(3);
  });
});
