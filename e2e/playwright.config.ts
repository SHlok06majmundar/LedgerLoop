import { defineConfig, devices } from '@playwright/test';

const API = 'http://localhost:4000';
const ORIGINS = 'http://localhost:3000,http://localhost:8081';

/**
 * Full-stack browser tests: the real API (with its job worker), the
 * production web build and the Expo app rendered for the web, all talking to
 * the database configured in apps/api/.env.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'website', testMatch: /website\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' } },
    {
      name: 'mobile-app',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: 'http://localhost:8081' },
    },
    {
      name: 'business-app',
      testMatch: /business\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' },
    },
    {
      name: 'admin-panel',
      testMatch: /admin\.spec\.ts/,
      dependencies: ['mobile-app', 'business-app'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @ledgerloop/api start',
      url: `${API}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { RUN_WORKER: 'true', RUN_SCHEDULER: 'false', WEB_ORIGINS: ORIGINS },
    },
    {
      command: 'pnpm --filter @ledgerloop/web start',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @ledgerloop/mobile exec expo start --web --port 8081',
      url: 'http://localhost:8081',
      reuseExistingServer: true,
      timeout: 240_000,
      env: { CI: '1', EXPO_PUBLIC_API_URL: API, BROWSER: 'none' },
    },
  ],
});
