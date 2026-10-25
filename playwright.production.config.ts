import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

const baseURL = 'http://127.0.0.1:4173/doc-diff-pro/';

export default defineConfig({
  ...baseConfig,
  testMatch: '**/production-smoke.spec.ts',
  testIgnore: [],
  outputDir: 'test-results/production',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/production' }]],
  use: { ...baseConfig.use, baseURL },
  webServer: {
    // Serve the build without a source-module endpoint or dev-server transforms.
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false
  },
  projects: [
    {
      name: 'production-chrome',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }
    },
    { name: 'production-webkit', use: { ...devices['Desktop Safari'] }, timeout: 60_000 }
  ]
});
