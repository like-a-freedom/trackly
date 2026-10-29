import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const viewport of [{width:1280,height:800},{width:393,height:852}]) {
    test.describe(`upload feedback at ${viewport.width}px`, () => {
        test.use({viewport});
        test('keeps failed upload inline, reveals safe diagnostics and retries without re-entry', async ({page}, testInfo) => {
            let requests = 0;
            await page.route('**/api/tracks/upload', async route => {
                requests++;
                await route.fulfill(requests === 1 ? {
                    status:500, contentType:'application/json',
                    body:JSON.stringify({code:500,error:'Internal server error',error_id:'error-reference-123'}),
                } : {
                    status:201, contentType:'application/json', body:JSON.stringify({id:'retry-success'}),
                });
            });
            await page.goto('/');
            await page.getByRole('button',{name:'Upload track file',exact:true}).click();
            const input = page.getByLabel('Choose GPX or KML track', {exact:true});
            await input.setInputFiles({name:'my-route.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx/>')});
            await page.getByRole('checkbox',{name:'Hiking',exact:true}).check();
            const upload = page.getByRole('button',{name:'Upload track',exact:true});
            await upload.click();
            const notice = page.getByRole('alert').filter({hasText:'Track was not uploaded'});
            await expect(notice).toBeVisible();
            await expect(notice).toBeFocused();
            await expect(notice).toContainText('Try again');
            await expect(page.getByText('Internal server error',{exact:false})).toHaveCount(0);
            await expect(page.getByLabel('Track name',{exact:true})).toHaveValue('my-route');
            await expect(page.getByRole('checkbox',{name:'Hiking',exact:true})).toBeChecked();
            await expect(notice.locator('dl')).toBeHidden();
            await notice.getByText('Technical details',{exact:true}).click();
            await expect(notice.locator('dl')).toBeVisible();
            await expect(notice).toContainText('HTTP 500');
            await expect(notice).toContainText('POST /api/tracks/upload');
            await expect(notice).toContainText('error-reference-123');
            const box = await notice.boundingBox();
            expect(box!.x).toBeGreaterThanOrEqual(0);
            expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);
            expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            const a11y = await new AxeBuilder({page}).include('.upload-form').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
            expect(a11y.violations).toEqual([]);
            await testInfo.attach('inline-upload-error',{body:await page.screenshot(),contentType:'image/png'});
            await upload.click();
            await expect(notice).toHaveCount(0);
            await expect(page.getByText('Track uploaded successfully!',{exact:true})).toBeVisible();
            expect(requests).toBe(2);
        });

        test('turns a proxy HTML error into readable feedback', async ({page}) => {
            await page.route('**/api/tracks/upload', route => route.fulfill({status:502, contentType:'text/html', body:'<html>Private proxy diagnostics</html>'}));
            await page.goto('/');
            await page.getByRole('button',{name:'Upload track file',exact:true}).click();
            await page.getByLabel('Choose GPX or KML track',{exact:true}).setInputFiles({name:'route.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx/>')});
            await page.getByRole('checkbox',{name:'Hiking',exact:true}).check();
            await page.getByRole('button',{name:'Upload track',exact:true}).click();
            const notice = page.getByRole('alert').filter({hasText:'Track was not uploaded'});
            await expect(notice).toContainText('The server could not complete this request.');
            await expect(page.getByText('Private proxy diagnostics',{exact:false})).toHaveCount(0);
            await expect(page.getByRole('button',{name:'Upload track',exact:true})).toBeEnabled();
        });
    });
}
