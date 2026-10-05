import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e', testMatch: ['lan-editor.spec.ts', 'live-editor.spec.ts', 'live-import.spec.ts', 'accessibility-live.spec.ts', 'live-account.spec.ts'], timeout: 60000, workers: 2,
    use: { headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    projects: [
        { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: {width:1280,height:800} } },
        { name: 'chromium-mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
        { name: 'webkit-mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    ],
});
