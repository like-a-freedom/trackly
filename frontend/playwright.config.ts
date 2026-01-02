import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: 'http://localhost:81',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5000,
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:81',
    cwd: process.cwd(),
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  },
});