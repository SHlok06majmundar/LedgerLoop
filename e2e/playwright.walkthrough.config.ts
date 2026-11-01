import { defineConfig, devices } from '@playwright/test';

/**
 * Guided walkthrough on a real account: fills an organization with a sample
 * business month and saves a screenshot of every step to ../walkthrough/.
 *   WALKTHROUGH_EMAIL=you@example.com WALKTHROUGH_PASSWORD=... npx playwright test -c playwright.walkthrough.config.ts
 */
export default defineConfig({
  testDir: './walkthrough',
  timeout: 900_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000', viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      command: 'pnpm --filter @ledgerloop/api start',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { RUN_WORKER: 'true', RUN_SCHEDULER: 'false' },
    },
    {
      command: 'pnpm --filter @ledgerloop/web start',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
