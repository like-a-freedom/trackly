import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const origin = process.env.TRACKLY_LAN_URL ?? 'http://192.168.20.28:81/';

test('live owner edit preserves anchors and places, exports every format and copies saved content', async ({ page }, testInfo) => {
    const session = randomUUID();
    const id = randomUUID();
    const created = [id];
    const name = `Live editor ${id}`;
    const longitude = 37.51 + parseInt(id.slice(0, 4), 16) / 10000000;
    const geometry = { type: 'MultiLineString', coordinates: [[[longitude, 56.34], [longitude + .001, 56.341], [longitude + .002, 56.342]]] };
    await page.addInitScript(value => localStorage.setItem('trackly_session_id', value), session);
    try {
        const response = await page.request.post(`${origin}api/tracks/create`, { data: {
            request_id: id, session_id: session, name, description: 'Original description', categories: [], geometry,
            waypoints: [{ lat: 56.34, lon: longitude, index: 0 }, { lat: 56.342, lon: longitude + .002, index: 2 }],
            segment_meta: [{ name: 'First leg', color: '#245bd7' }],
            pois: [{ lat: 56.34, lon: longitude, name: 'Start spring', category: 'water' }],
        } });
        expect(response.status()).toBe(201);
        await page.goto(`${origin}tracks/${id}/edit`);
        await expect(page.getByTestId('top-bar-track-name')).toHaveText(name, { timeout: 20000 });
        await page.getByRole('button', { name: 'Description', exact: true }).click();
        await page.getByTestId('track-name-input').fill(`${name} revised`);
        await page.getByRole('checkbox', { name: 'Walking', exact: true }).check();
        await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
        const axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        expect(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}))).toEqual([]);
        await page.screenshot({path:`../docs/audit/2026-10-04-design-evidence/implementation/live-editor-${testInfo.project.name}.png`});
        await page.getByTestId('top-bar-save').click();
        await expect(page).toHaveURL(`${origin}track/${id}`, { timeout: 15000 });
        const readback = await page.request.get(`${origin}api/tracks/${id}/simplified`, { headers: { 'x-session-id': session } });
        expect(readback.ok()).toBe(true);
        const saved = await readback.json();
        expect(saved.name).toBe(`${name} revised`);
        expect(saved.categories).toEqual(['walking']);
        expect(saved.waypoints).toHaveLength(2);
        expect(saved.segment_meta).toEqual([{ name: 'First leg', color: '#245bd7' }]);
        const places = await page.request.get(`${origin}api/tracks/${id}/pois`);
        expect(JSON.stringify(await places.json())).toContain('Start spring');
        await page.goto(`${origin}tracks/${id}/edit`);
        await expect(page.getByTestId('top-bar-saved-badge')).toBeVisible();
        for (const format of ['gpx', 'kml', 'geojson']) {
            await page.getByRole('button', { name: 'More', exact: true }).click();
            const downloaded = page.waitForEvent('download');
            await page.getByTestId(`top-bar-export-${format}`).click();
            const file = await downloaded;
            expect(await file.failure()).toBeNull();
            expect(file.suggestedFilename()).toContain(`${name} revised`);
            const content = await readFile((await file.path())!, 'utf8');
            expect(content).toContain(`${name} revised`);
            expect(content).toContain(format === 'geojson' ? 'Feature' : format === 'gpx' ? '<gpx' : '<kml');
        }
        await page.reload();
        await expect(page.getByTestId('top-bar-track-name')).toHaveText(`${name} revised`);
        await page.getByRole('button', { name: 'Review', exact: true }).click();
        const copyResponse = page.waitForResponse(response => response.url().endsWith(`/api/tracks/${id}/duplicate`) && response.request().method() === 'POST');
        await page.getByTestId('duplicate-track-btn').click();
        const copy = await copyResponse;
        expect(copy.ok()).toBe(true);
        const copiedId = (await copy.json()).id;
        created.push(copiedId);
        const copied = await page.request.get(`${origin}api/tracks/${copiedId}/simplified`, { headers: { 'x-session-id': session } });
        expect((await copied.json()).segment_meta).toEqual(saved.segment_meta);
        const copiedPlaces = await page.request.get(`${origin}api/tracks/${copiedId}/pois`);
        expect(JSON.stringify(await copiedPlaces.json())).toContain('Start spring');
    } finally {
        for (const fixture of created) {
            const response = await page.request.delete(`${origin}api/tracks/${fixture}`, { data: { session_id: session } });
            expect([200, 404]).toContain(response.status());
        }
    }
});
