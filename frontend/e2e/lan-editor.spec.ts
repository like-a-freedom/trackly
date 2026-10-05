import { test, expect } from '@playwright/test';

test('editor opens and retains a draft on insecure LAN HTTP', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.TRACKLY_LAN_URL ?? 'http://192.168.20.28:81/');
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    await page.getByRole('button', { name: 'Create new track', exact: true }).click();
    await expect(page.getByTestId('top-bar-save')).toBeVisible();
    await page.getByRole('button', { name: 'Description', exact: true }).click();
    await page.getByTestId('track-name-input').fill('Safari LAN draft');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('trackly_draft') ?? '{}').track?.name)).toBe('Safari LAN draft');
    await page.reload();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('button', { name: 'Description', exact: true }).click();
    await expect(page.getByTestId('track-name-input')).toHaveValue('Safari LAN draft');
    expect(errors).toEqual([]);
});

for (const route of [
    { name: 'Kominterna Street', points: [['56.0449853', '37.8306491'], ['56.0451183', '37.8551955']] },
    { name: 'Sovetskaya Street in Dmitrov', points: [['56.3427144', '37.5182066'], ['56.3394371', '37.5158755']] },
]) test(`real road graph routes along ${route.name}`, async ({ page }) => {
    await page.goto((process.env.TRACKLY_LAN_URL ?? 'http://192.168.20.28:81/') + 'tracks/new');
    await expect(page.getByTestId('routing-coverage')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('top-bar-status')).toBeHidden();
    await page.getByRole('button', { name: 'Description', exact: true }).click();
    await page.getByTestId('track-name-input').fill('Real road graph regression');
    await page.getByRole('button', { name: 'Route', exact: true }).click();
    await page.getByText('Edit points by coordinates', { exact: true }).click();
    for (const [lat, lon] of route.points) {
        await page.getByLabel('Latitude', { exact: true }).fill(lat);
        await page.getByLabel('Longitude', { exact: true }).fill(lon);
        await page.getByRole('button', { name: 'Add point', exact: true }).click();
    }
    await expect(page.getByTestId('top-bar-save')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('trackly_draft') ?? '{}').track?.segments?.[0]?.points?.length ?? 0)).toBeGreaterThan(5);
    await page.getByLabel('Latitude', { exact: true }).fill('57.0');
    await page.getByRole('button', { name: 'Add point', exact: true }).click();
    await expect(page.getByText(/Outside road graph coverage/)).toBeVisible();
});
