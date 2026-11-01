import { expect, type Page } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const API = 'http://localhost:4000/api/v1';

/** The account requested for manual testing; created through the mobile app. */
/** Credentials come from the environment (E2E_ACCOUNT_EMAIL / E2E_ACCOUNT_PASSWORD); never commit them. */
export const SHLOK = {
  name: 'Shlok',
  email: process.env.E2E_ACCOUNT_EMAIL ?? 'shlok@gmail.com',
  get password(): string {
    const value = process.env.E2E_ACCOUNT_PASSWORD;
    if (!value) throw new Error('Set E2E_ACCOUNT_PASSWORD to run the mobile and admin browser tests');
    return value;
  },
};

/** Unique, deliverable test addresses (Gmail plus-addressing to the project inbox). */
export const testEmail = (tag: string) => `majmundarshlok06+e2e-${tag}-${Date.now()}@gmail.com`;
export const TEST_PASSWORD = 'E2e-Test-pass-2026';

function apiEnv(): Record<string, string> {
  const file = join(__dirname, '..', '..', 'apps', 'api', '.env');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^(\w+)=\"?(.*?)\"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1]!, m[2]!]),
  );
}

/** Grants platform Super Admin to an existing user, as the admin:promote script does. */
export async function promoteSuperAdmin(email: string): Promise<void> {
  const env = { ...apiEnv(), ...process.env } as Record<string, string>;
  const client = await MongoClient.connect(env.MONGODB_URI!);
  try {
    await client.db(env.MONGODB_DB ?? 'ledgerloop').collection('users').updateOne({ email }, { $set: { isSuperAdmin: true } });
  } finally {
    await client.close();
  }
}

/** DD/MM/YYYY for a date `days` from today, as bank statements print it. */
export function statementDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();
}

export async function signInWeb(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/);
}
