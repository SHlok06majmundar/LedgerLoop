import { defineConfig, devices } from '@playwright/test';

/**
 * Captures a screenshot of every screen into ../walkthrough/screens/.
 * Public screens need only the web and mobile servers; in-app screens also
 * need the API (they are skipped when it is not reachable).
 *   npx playwright test -c playwright.screens.config.ts
 */
export default defineConfig({
  testDir: './screens',
  timeout: 600_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'web', testMatch: /web\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'], baseURL: 'http://localhost:8081' } },
  ],
  webServer: [
    { command: 'pnpm --filter @ledgerloop/web start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
    {
      command: 'pnpm --filter @ledgerloop/mobile exec expo start --web --port 8081',
      url: 'http://localhost:8081',
      reuseExistingServer: true,
      timeout: 240_000,
      env: { CI: '1', EXPO_PUBLIC_API_URL: 'http://localhost:4000', BROWSER: 'none' },
    },
  ],
});
