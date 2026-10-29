import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const build = path.resolve('dist');
const evidence = path.resolve('../docs/audit/2026-10-04-design-evidence/implementation');
const types: Record<string,string> = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.wasm':'application/wasm', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };

test.beforeEach(async ({ page }) => {
 await page.route('http://localhost:81/**', async route => {
  const request = route.request(); const url = new URL(request.url());
  if (url.pathname === '/api/feature-flags') return route.fulfill({ json:{auth:false,editor:true} });
  if (url.pathname === '/api/elevation/preview') return route.fulfill({status:503,json:{error:'Elevation unavailable in the browser fixture'}});
  if (url.pathname.startsWith('/api/')) {
   try {
    const response = await route.fetch({url:`http://localhost:8080${url.pathname}${url.search}`});
    return route.fulfill({response});
   } catch {
    return route.fulfill({status:503,json:{error:'Local API unavailable'}});
   }
  }
  const file = path.resolve(build, url.pathname === '/' ? 'index.html' : '.'+url.pathname);
  if (!file.startsWith(build+path.sep)) return route.fulfill({status:403});
  try { return route.fulfill({body:await readFile(file),contentType:types[path.extname(file)] ?? 'application/octet-stream'}); }
  catch { return route.fulfill({body:await readFile(path.join(build,'index.html')),contentType:'text/html'}); }
 });
});

test.afterEach(async ({page}) => { await page.unrouteAll({behavior:'ignoreErrors'}); });

for (const viewport of [{width:1280,height:800},{width:390,height:844},{width:320,height:568}]) {
 test(`editor preserves map and reachable commands at ${viewport.width}px`, async ({page}) => {
  await page.setViewportSize(viewport);
  await page.goto('/tracks/new');
  if (viewport.width > 900) await expect(page.getByRole('button',{name:'Draw',exact:true})).toBeVisible();
  else await expect(page.getByRole('combobox',{name:'Drawing tool'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeVisible();
  await expect(page.getByTestId('top-bar-save')).toBeVisible();
  await page.getByRole('button',{name:'Description',exact:true}).click();
  await expect(page.getByTestId('track-name-input')).toBeVisible();
  expect(await page.getByTestId('track-name-input').count()).toBe(1);
  const map = await page.getByTestId('editor-map-region').boundingBox();
  const panel = await page.getByTestId('editor-left-panel').boundingBox();
  expect(map).not.toBeNull(); expect(panel).not.toBeNull();
  if (viewport.width > 900) expect(map!.x+map!.width).toBeLessThanOrEqual(panel!.x+1);
  else {
   expect(panel!.y-map!.y).toBeGreaterThan(150);
   await page.getByRole('button',{name:'Expand route panel',exact:true}).click();
   await expect(page.getByRole('button',{name:'Collapse route panel',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Collapse route panel',exact:true}).click();
   await expect(page.getByRole('button',{name:'Open route panel',exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'More',exact:true}).click();
  const activity = page.getByRole('combobox',{name:'Routing activity'});
  await expect(activity).toBeVisible();
  await activity.selectOption('walking');
  await activity.press('Escape');
  await expect(page.getByRole('button',{name:'More',exact:true})).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.leaflet-tile-loaded').first().waitFor({state:'visible',timeout:10000}).catch(() => {});
  await page.screenshot({path:path.join(evidence,`editor-${viewport.width}.png`),fullPage:true,animations:'disabled'});
  if (viewport.width <= 900) {
   await page.getByRole('button',{name:'Open route panel',exact:true}).click();
   await page.screenshot({path:path.join(evidence,`editor-medium-${viewport.width}.png`),fullPage:true,animations:'disabled'});
   await page.getByRole('button',{name:'Expand route panel',exact:true}).click();
   await page.screenshot({path:path.join(evidence,`editor-full-${viewport.width}.png`),fullPage:true,animations:'disabled'});
  }
 });
}

test('coordinate entry and name survive a reload', async ({page}) => {
 await page.goto('/tracks/new');
 await page.getByRole('button',{name:'More',exact:true}).click();
 await page.getByTestId('top-bar-routing-toggle').uncheck();
 await page.getByTestId('top-bar-routing-toggle').press('Escape');
 await page.getByRole('button',{name:'Description',exact:true}).click();
 await page.getByTestId('track-name-input').fill('Draft regression route');
 await page.getByRole('button',{name:'Route',exact:true}).click();
 await page.getByText('Edit points by coordinates',{exact:true}).click();
 await page.getByLabel('Latitude',{exact:true}).fill('56.04');
 await page.getByLabel('Longitude',{exact:true}).fill('37.83');
 await page.getByRole('button',{name:'Add point',exact:true}).click();
 await page.getByLabel('Latitude',{exact:true}).fill('56.05');
 await page.getByRole('button',{name:'Add point',exact:true}).click();
 await expect(page.getByTestId('top-bar-save')).toBeEnabled();
 await page.waitForFunction(() => JSON.parse(localStorage.getItem('trackly_draft') ?? '{}').track?.name === 'Draft regression route');
 await page.reload();
 await page.getByRole('button',{name:'Restore',exact:true}).click();
 await expect(page.getByTestId('top-bar-track-name')).toHaveText('Draft regression route');
 await expect(page.getByTestId('top-bar-save')).toBeEnabled();
 await page.getByRole('link',{name:'Back to map'}).click();
 await expect(page.getByRole('dialog',{name:'Leave editor?'})).toBeVisible();
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await expect(page).toHaveURL(/tracks\/new/);
 await page.getByRole('link',{name:'Back to map'}).click();
 await page.getByRole('button',{name:'Leave editor',exact:true}).click();
 await expect(page).toHaveURL('http://localhost:81/');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('trackly_draft')??'{}').track?.name)).toBe('Draft regression route');
});

const fixtureId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fixtureTrack = {id:fixtureId,name:'Design verification route',description:'Synthetic browser fixture',categories:['walking'],length_km:2.5,elevation_up:120,elevation_gain:120,elevation_loss:100,geom_geojson:{type:'MultiLineString',coordinates:[[[37.83,56.04],[37.84,56.05],[37.85,56.06]]]},created_at:'2026-10-05T00:00:00Z',is_public:true};
for (const viewport of [{width:1280,height:800},{width:390,height:844},{width:320,height:568}]) {
 test(`home, import and track details remain usable at ${viewport.width}px`,async ({page}) => {
  await page.setViewportSize(viewport);
  let trackName = fixtureTrack.name;
  await page.route('**/api/tracks**', route => {
   const pathname = new URL(route.request().url()).pathname;
   if (pathname.endsWith('/pois') || pathname.endsWith('/distance-markers')) return route.fulfill({json:[]});
   if (pathname.includes(fixtureId)) return route.fulfill({json:{...fixtureTrack,name:trackName}});
   return route.fulfill({json:{type:'FeatureCollection',features:[]}});
  });
  await page.goto('/');
  await expect(page.getByText('Create route',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Upload track file',exact:true}).click();
  await expect(page.getByLabel('Choose GPX or KML track')).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:path.join(evidence,`home-import-${viewport.width}.png`),fullPage:true,animations:'disabled'});
  await page.goto('/track/'+fixtureId);
  await expect(page.getByText('Design verification route',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Not recorded',{exact:true}).first()).toBeVisible();
  const panel = await page.locator('.track-detail-flyout').boundingBox();
  expect(panel!.x).toBe(0);
  expect(panel!.width).toBe(viewport.width);
  expect(panel!.y + panel!.height).toBeCloseTo(viewport.height, 0);
  expect(panel!.height).toBeLessThanOrEqual(viewport.height / 2 + 1);
  if (viewport.width > 900) {
   const title = await page.locator('.title-with-edit').boundingBox();
   const actions = await page.locator('.track-name-block .header-actions').boundingBox();
   expect(actions!.x).toBeGreaterThan(title!.x + title!.width);
   expect(Math.abs(actions!.y - title!.y)).toBeLessThan(10);
   await expect(page.locator('.basic-info-grid')).toHaveCSS('display', 'grid');
   const stats = await page.locator('.basic-info-grid .stat-item').evaluateAll(items => items.map(item => item.getBoundingClientRect().y));
   expect(stats[0]).toBe(stats[1]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:path.join(evidence,`track-${viewport.width}.png`),fullPage:true,animations:'disabled'});
  if(viewport.width>900) {
   await expect(page.locator('.fullscreen-map')).toHaveCSS('width',`${viewport.width}px`);
   await page.getByRole('button',{name:'Collapse panel',exact:true}).click();
   await expect(page.locator('.fullscreen-map')).toHaveCSS('width',`${viewport.width}px`);
   await page.getByRole('button',{name:'Expand panel',exact:true}).click();
   await expect(page.locator('.fullscreen-map')).toHaveCSS('width',`${viewport.width}px`);
  }
  trackName = 'LongUnbrokenTrackName'.repeat(12);
  await page.reload();
  await expect(page.locator('.track-name-block h2')).toHaveText('LongUnbrokenTrackName'.repeat(12));
  const actions = await page.locator('.track-name-block .header-actions').boundingBox();
  expect(actions!.x).toBeGreaterThanOrEqual(0);
  expect(actions!.x + actions!.width).toBeLessThanOrEqual(viewport.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}
test('account distinguishes an empty collection from a loading failure and traps nickname focus', async ({page}) => {
 await page.route('**/api/feature-flags',route => route.fulfill({json:{auth:true,editor:true}}));
 await page.route('**/api/auth/refresh',route => route.fulfill({json:{access_token:'fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture'}}));
 await page.route('**/api/account/me',route => route.fulfill({json:{user_id:fixtureId,nickname:'Design fixture',email:'fixture@example.invalid',created_at:'2026-10-05T00:00:00Z'}}));
 let fail = true;
 await page.route('**/api/account/tracks?**', route => fail ? route.fulfill({status:503,json:{error:'fixture'}}) : route.fulfill({json:{tracks:[],total:0}}));
 await page.goto('/account');
 await expect(page.getByText('Could not load your tracks. Please retry.',{exact:true})).toBeVisible();
 await expect(page.getByText("You don't have any tracks yet",{exact:true})).toHaveCount(0);
 fail=false; await page.getByRole('button',{name:'Retry loading tracks'}).click();
 await expect(page.getByText("You don't have any tracks yet",{exact:true})).toBeVisible();
 await page.screenshot({path:path.join(evidence,'account-1280.png'),fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Edit Nickname',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit nickname'}); await expect(dialog).toBeVisible();
 await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});



for (const viewport of [{width:1280,height:800},{width:390,height:844},{width:320,height:740}]) {
 test(`distance markers are a personal browser preference across segmented tracks at ${viewport.width}px`, async ({page, browserName}) => {
  await page.setViewportSize(viewport);
  let writes = 0;
  await page.route('**/api/tracks**', route => {
   if (route.request().method() === 'PATCH') {
    writes++;
    return route.fulfill({status:500,json:{error:'Unexpected API write'}});
   }
   if (new URL(route.request().url()).pathname.endsWith('/pois')) return route.fulfill({json:[]});
   return route.fulfill({json:{...fixtureTrack,is_owner:false,length_km:94,distance_markers_enabled:false,
    geom_geojson:{type:'MultiLineString',coordinates:[[[37,56],[37.001,56]],[[37.01,56],[38.5,56]]]}}});
  });
  await page.goto('/track/'+fixtureId+'?zoom=10&lat=56&lng=37.7');
  const display = page.locator('.track-name-block .header-actions');
  await expect(page.getByRole('region', {name:'Map display'})).toHaveCount(0);
  const toggle = display.getByRole('button', {name:'Distance markers',exact:true});
  const markers = page.locator('.km-label');
  await expect.poll(() => markers.count()).toBeGreaterThan(0);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await display.scrollIntoViewIfNeeded();
  await display.screenshot({path:`../.impeccable/review/distance-markers-${viewport.width}${browserName === 'webkit' ? '-webkit' : ''}.png`,animations:'disabled'});
  await toggle.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  const hintBox = await page.getByRole('tooltip').boundingBox();
  expect(hintBox!.x).toBeGreaterThanOrEqual(8);
  expect(hintBox!.x + hintBox!.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(await page.getByRole('tooltip').evaluate(el => {
   const box = el.getBoundingClientRect();
   return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  const hintColor = await page.getByRole('tooltip').evaluate(el => getComputedStyle(el).backgroundColor);
  expect(hintColor).toBe(await page.evaluate(() => {
   const surface = document.createElement('span');
   surface.style.backgroundColor = 'var(--color-surface)';
   document.body.append(surface);
   const color = getComputedStyle(surface).backgroundColor;
   surface.remove(); return color;
  }));
  await page.getByRole('tooltip').click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await display.getByRole('button', {name:'Share track',exact:true}).focus();
  await expect(page.getByRole('tooltip')).toHaveText('Copy shareable link');
  expect(await page.getByRole('tooltip').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(hintColor);
  await toggle.focus();
  await page.screenshot({path:`../.impeccable/review/markers-toolbar-hint-${viewport.width}-${browserName}.png`,animations:'disabled'});
  await toggle.press('Escape');
  await expect(page.getByRole('tooltip')).not.toBeVisible();
  await toggle.click();
  await expect(markers).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('trackly_distance_markers'))).toBe('false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(markers).toHaveCount(0);
  await toggle.focus();
  await toggle.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => markers.count()).toBeGreaterThan(0);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => markers.count()).toBeGreaterThan(0);
  expect(writes).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}

for (const width of [1280, 390]) {
 test(`category tags share view and edit styles at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  await page.route('**/api/tracks**', route => {
   if (new URL(route.request().url()).pathname.endsWith('/pois')) return route.fulfill({json:[]});
   return route.fulfill({json:{...fixtureTrack,is_owner:true,categories:['hiking','running'],auto_classifications:['Long Run']}});
  });
  await page.goto('/track/'+fixtureId);
  const nameEdit = page.getByRole('button',{name:'Edit track name',exact:true});
  await expect(nameEdit).toHaveClass(/track-action-button/);
  await nameEdit.click();
  const nameForm = page.locator('.name-edit-block');
  await expect(nameForm.locator('.track-action-button')).toHaveCount(2);
  await nameForm.screenshot({path:`../.impeccable/review/name-actions-${width}.png`});
  await nameForm.getByRole('button',{name:'Cancel',exact:true}).click();
  const descriptionEdit = page.locator('.edit-description-btn');
  await expect(descriptionEdit).toHaveClass(/track-action-button/);
  await descriptionEdit.click();
  const descriptionForm = page.locator('.description-edit-block');
  await expect(descriptionForm.locator('.track-action-button')).toHaveCount(2);
  await descriptionForm.screenshot({path:`../.impeccable/review/description-actions-${width}.png`});
  await descriptionForm.getByRole('button',{name:'Cancel',exact:true}).click();
  const categories = page.getByRole('region',{name:'Track categories',exact:true});
  await expect(categories.locator('.track-tag')).toHaveCount(2);
  await expect(categories.locator('input')).toHaveCount(0);
  const editAction = categories.getByRole('button',{name:'Edit categories',exact:true});
  await expect(editAction).toHaveClass(/ui-secondary/);
  const headingBox = await categories.locator('legend').boundingBox();
  const editBox = await editAction.boundingBox();
  const labelBox = await categories.locator('legend > span > span').boundingBox();
  expect(editBox!.x - labelBox!.x - labelBox!.width).toBeCloseTo(8, 0);
  expect(editBox!.height).toBe(28);
  expect(await editAction.evaluate(el => { const box = el.getBoundingClientRect(); const inset = parseFloat(getComputedStyle(el, "::after").top); return box.height - 2 * inset; })).toBeGreaterThanOrEqual(44);
  await categories.scrollIntoViewIfNeeded();
  await categories.screenshot({path:`../.impeccable/review/categories-view-${width}.png`});
  await categories.getByRole('button',{name:'Edit categories',exact:true}).click();
  await expect(categories.getByRole('checkbox')).toHaveCount(6);
  await expect(categories.getByRole('checkbox').first()).toBeFocused();
  await categories.getByRole('checkbox',{name:'Walking',exact:true}).check();
  await expect(categories.getByRole('button',{name:'Save categories',exact:true})).toBeEnabled();
  const saveAction = categories.getByRole('button',{name:'Save categories',exact:true});
  const cancelAction = categories.getByRole('button',{name:'Cancel',exact:true});
  await expect(saveAction).toHaveClass(/ui-primary/);
  await expect(cancelAction).toHaveClass(/ui-secondary/);
  const saveBox = await saveAction.boundingBox();
  const cancelBox = await cancelAction.boundingBox();
  expect(saveBox!.x).toBeCloseTo(headingBox!.x, 0);
  expect(saveBox!.y).toBeCloseTo(cancelBox!.y, 0);
  expect(saveBox!.height).toBeCloseTo(cancelBox!.height, 0);
  expect(cancelBox!.x - saveBox!.x - saveBox!.width).toBeCloseTo(12, 0);
  const option = categories.locator('.track-tag-option').first();
  expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await categories.screenshot({path:`../.impeccable/review/categories-edit-${width}.png`});
  await categories.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(categories.locator('input')).toHaveCount(0);
  await expect(categories.locator('.track-tag')).toHaveText(['Hiking','Running']);
  await expect(categories.getByRole('button',{name:'Edit categories',exact:true})).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}

for (const width of [1280, 390, 320]) {
 test(`elevation refresh aligns with chart controls at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  await page.route('**/api/tracks**', route => {
   if (new URL(route.request().url()).pathname.endsWith('/pois')) return route.fulfill({json:[]});
   return route.fulfill({json:{...fixtureTrack,is_owner:true,slope_segments:[{start_index:0,end_index:2,slope:3}]}});
  });
  await page.goto('/track/'+fixtureId);
  const refresh = page.getByRole('button',{name:'Recalculate elevation',exact:true});
  await refresh.scrollIntoViewIfNeeded();
  const controls = refresh.locator('..');
  const tabs = controls.locator('.chart-toggles');
  const refreshBox = await refresh.boundingBox();
  const tabsBox = await tabs.boundingBox();
  expect(Math.abs(refreshBox!.y + refreshBox!.height / 2 - tabsBox!.y - tabsBox!.height / 2)).toBeLessThan(1);
  expect(tabsBox!.x - refreshBox!.x - refreshBox!.width).toBeCloseTo(12, 0);
  const edit = page.getByRole('button',{name:'Edit categories',exact:true});
  const dimensions = (locator: typeof edit) => locator.evaluate(el => { const style = getComputedStyle(el); return [style.width,style.height,style.color,style.borderRadius]; });
  expect(await dimensions(refresh)).toEqual(await dimensions(edit));
  await expect(page.getByTestId('elevation-slope-toggle')).toBeVisible();
  await page.getByTestId('elevation-slope-toggle').click();
  await expect(page.getByTestId('elevation-slope-toggle')).toHaveClass(/active/);
  await controls.screenshot({path:`../.impeccable/review/elevation-actions-${width}.png`});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}
