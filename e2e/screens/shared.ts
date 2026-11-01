import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const OUT = join(__dirname, '..', '..', 'walkthrough', 'screens');
mkdirSync(OUT, { recursive: true });

/** Accounts come from the environment so no credentials live in the repository. */
export const ACCOUNT = {
  email: process.env.SCREENS_EMAIL ?? '',
  password: process.env.SCREENS_PASSWORD ?? '',
};
export const ADMIN = {
  email: process.env.SCREENS_ADMIN_EMAIL ?? '',
  password: process.env.SCREENS_ADMIN_PASSWORD ?? '',
};
export const hasAccount = () => Boolean(ACCOUNT.email && ACCOUNT.password);
export const hasAdmin = () => Boolean(ADMIN.email && ADMIN.password);

/** True when the API answers and its database is up. */
export async function apiReady(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:4000/health', { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function capture(page: Page, prefix: string, name: string, fullPage = true) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${prefix}-${name}.png`), fullPage });
}
