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
  await page.route('**/api/tracks**', route => {
   const pathname = new URL(route.request().url()).pathname;
   if (pathname.endsWith('/pois') || pathname.endsWith('/distance-markers')) return route.fulfill({json:[]});
   if (pathname.includes(fixtureId)) return route.fulfill({json:fixtureTrack});
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
  if(viewport.width>900) { const panel=await page.locator('.track-detail-flyout').boundingBox(); expect(panel!.width).toBeLessThanOrEqual(381); expect(panel!.x).toBeGreaterThan(850); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:path.join(evidence,`track-${viewport.width}.png`),fullPage:true,animations:'disabled'});
  if(viewport.width>900) {
   await expect(page.locator('.fullscreen-map')).toHaveCSS('width',`${viewport.width-380}px`);
   await page.getByRole('button',{name:'Collapse panel',exact:true}).click();
   await expect(page.locator('.fullscreen-map')).toHaveCSS('width',`${viewport.width}px`);
   await page.getByRole('button',{name:'Expand panel',exact:true}).click();
   await expect(page.locator('.fullscreen-map')).toHaveCSS('width',`${viewport.width-380}px`);
  }
 });
}
test('account distinguishes an empty collection from a loading failure and traps nickname focus', async ({page}) => {
 await page.route('**/api/feature-flags',route => route.fulfill({json:{auth:true,editor:true}}));
 await page.route('**/api/auth/refresh',route => route.fulfill({json:{access_token:'fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture'}}));
 await page.route('**/api/account/me',route => route.fulfill({json:{user_id:fixtureId,nickname:'Design fixture',email:'fixture@example.invalid',created_at:'2026-10-05T00:00:00Z'}}));
 let fail = true;
 await page.route('**/api/users/me/tracks?**', route => fail ? route.fulfill({status:503,json:{error:'fixture'}}) : route.fulfill({json:{tracks:[],total:0}}));
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
