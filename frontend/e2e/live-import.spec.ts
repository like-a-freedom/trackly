import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const origin = process.env.TRACKLY_LAN_URL ?? 'http://192.168.20.28:81/';
for (const fixture of [
    { source: '../tracks/gpx/uncurated/alol_ultra_trail/5км.gpx', name: 'recorded.gpx', type: 'application/gpx+xml' },
    { source: '../tracks/kml/Смоленское поозерье - разведка.kml', name: 'route.kml', type: 'application/vnd.google-earth.kml+xml' },
]) test(`live import, duplicate link and source preservation for ${fixture.name}`, async ({ page }, testInfo) => {
    const session = randomUUID();
    const content = await readFile(path.resolve(fixture.source));
    const buffer = Buffer.concat([content, Buffer.from(`\n<!-- Acceptance fixture ${randomUUID()} -->`)]);
    let id: string | null = null;
    await page.addInitScript(value => localStorage.setItem('trackly_session_id', value), session);
    try {
        await page.goto(origin);
        await page.getByRole('button', { name: 'Upload track file', exact: true }).click();
        await page.getByLabel('Choose GPX or KML track', { exact: true }).setInputFiles({ name: fixture.name, mimeType: fixture.type, buffer });
        await page.getByLabel('Track name', { exact: true }).fill(`Source acceptance ${session}`);
        const uploaded = page.waitForResponse(r => r.url().endsWith('/api/tracks/upload') && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'Upload track', exact: true }).click();
        const response = await uploaded;
        expect(response.status()).toBe(201);
        id = (await response.json()).id;
        await expect(page.getByRole('button', { name: 'View track', exact: true })).toBeVisible();
        const original = await page.request.get(`${origin}api/tracks/${id}/simplified`, { headers: { 'x-session-id': session } });
        const data = await original.json();
        if (fixture.name.endsWith('.gpx')) {
            expect(data.time_data).toHaveLength(46);
            const geometry = data.geom_geojson;
            expect(geometry.type).toBe('MultiLineString');
            expect(geometry.coordinates[0]).toHaveLength(46);
            // Independent 3D-vector measurement of the original 46-point GPX.
            expect(data.length_km).toBeCloseTo(5.434198128496304, 6);
        }
        if (fixture.name.endsWith('.kml')) {
            expect(data.length_km).toBeCloseTo(128.44642078202975,6);
            expect(data.geom_geojson.coordinates[0]).toHaveLength(1948);
        }
        await page.reload();
        await page.getByRole('button', { name: 'Upload track file', exact: true }).click();
        await page.getByLabel('Choose GPX or KML track', { exact: true }).setInputFiles({ name: fixture.name, mimeType: fixture.type, buffer });
        await page.getByRole('button', { name: 'Upload track', exact: true }).click();
        await expect(page.getByRole('button', { name: 'View existing track' })).toBeVisible();
        await page.getByRole('button', { name: 'View existing track' }).click();
        await expect(page).toHaveURL(`${origin}track/${id}`);
        await expect(page.getByText(`Source acceptance ${session}`,{exact:true}).first()).toBeVisible();
        await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));
        const panel=await page.locator('.track-detail-flyout').boundingBox();
        for (const label of ['Delete track','Collapse panel','Close panel']) {
            const action=page.getByRole('button',{name:label,exact:true});
            const box=await action.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.x+box!.width).toBeLessThanOrEqual(panel!.x+panel!.width);
        }
        const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        await testInfo.attach('detail-axe',{body:JSON.stringify(axe),contentType:'application/json'});
        expect(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}))).toEqual([]);
        if (fixture.name.endsWith('.gpx')) await page.screenshot({path:`../docs/audit/2026-10-04-design-evidence/implementation/live-detail-${testInfo.project.name}.png`});
        // A duplicate in another private session must not disclose its identifier.
        const visibility = await page.request.patch(`${origin}api/tracks/${id}/visibility`, { data: { session_id: session, is_public: false } });
        expect(visibility.ok()).toBe(true);
        const privateDuplicate = await page.request.post(`${origin}api/tracks/upload`, { multipart: {
            file: { name: fixture.name, mimeType: fixture.type, buffer }, session_id: randomUUID(),
        } });
        expect(privateDuplicate.status()).toBe(409);
        expect((await privateDuplicate.json()).existing_track_id).toBeNull();
    } finally {
        if (id) expect((await page.request.delete(`${origin}api/tracks/${id}`, { data: { session_id: session } })).ok()).toBe(true);
    }
});
