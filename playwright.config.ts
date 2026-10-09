import { defineConfig, devices } from '@playwright/test';

// Complete image-preview flows take about 30 seconds on Linux WebKit in CI.
// Give those projects headroom while keeping individual assertions at 10 seconds.
const webkitTimeout = process.platform === 'linux' ? 60_000 : 30_000;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  globalTimeout: process.env.CI ? 15 * 60_000 : undefined,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // `list` keeps the console readable; `html` leaves behind playwright-report/
  // so a failing CI run has something to upload and inspect. Traces are already
  // retained on failure and get embedded in that report.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173/doc-diff-pro/',
    trace: 'retain-on-failure'
  },
  webServer: {
    // Launch Vite directly so its process and output streams are closed when
    // Playwright terminates the server's process group during teardown.
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/doc-diff-pro/',
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' } },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true
      }
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', timeout: webkitTimeout, use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', timeout: webkitTimeout, use: { ...devices['iPhone 13'] } }
  ]
});
