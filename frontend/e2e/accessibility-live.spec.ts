import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = process.env.TRACKLY_LAN_URL ?? 'http://192.168.20.28:81/';
test('live public surfaces have no WCAG A/AA violations', async ({ page }, testInfo) => {
  for (const path of ['', 'tracks/new', 'auth/callback?error=access_denied']) {
    await page.goto(origin + path);
    if (path === 'tracks/new') {
      await expect(page.getByTestId('routing-coverage')).toBeVisible({timeout:20000});
      await page.getByRole('button',{name:'Description',exact:true}).click();
      await page.getByTestId('track-name-input').fill('Длинное название маршрута в Дмитрове — проверка доступности');
    }
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
    const result = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    await testInfo.attach(`axe-${path.split('/')[0] || 'home'}`,{body:JSON.stringify(result),contentType:'application/json'});
    expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  }
});
