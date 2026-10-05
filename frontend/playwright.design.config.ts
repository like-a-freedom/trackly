import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'e2e', testMatch:'design-mitigation.spec.ts', timeout:30000,
 use:{baseURL:'http://localhost:81', headless:true, viewport:{width:1280,height:800}, screenshot:'only-on-failure', trace:'retain-on-failure'},
});
