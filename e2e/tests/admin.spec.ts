import { expect, test } from '@playwright/test';
import { expectToast, promoteSuperAdmin, SHLOK, signInWeb } from './support';

/** Super Admin panel, signed in as shlok@gmail.com (promoted for this test). */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await promoteSuperAdmin(SHLOK.email);
});

test('is reachable from the account menu and shows platform totals', async ({ page }) => {
  await signInWeb(page, SHLOK.email, SHLOK.password);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Admin panel' }).click();
  await page.waitForURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
  await expect(page.getByText('Organizations').first()).toBeVisible();
  await expect(page.getByText('New users by month')).toBeVisible();
});

test('suspends and restores an organization', async ({ page }) => {
  await signInWeb(page, SHLOK.email, SHLOK.password);
  await page.goto('/admin/organizations');
  await page.getByRole('searchbox').fill('E2E Traders');
  const row = page.getByRole('row', { name: /E2E Traders/ }).first();
  await row.getByRole('button', { name: 'Suspend' }).click();
  await expectToast(page, /suspended/);
  await expect(row.getByText('Suspended')).toBeVisible();
  await row.getByRole('button', { name: 'Restore' }).click();
  await expectToast(page, /restored/);
});

test('deactivates and reactivates a user', async ({ page }) => {
  await signInWeb(page, SHLOK.email, SHLOK.password);
  await page.goto('/admin/users');
  await page.getByRole('searchbox').fill('e2e-owner');
  const row = page.getByRole('row', { name: /e2e-owner/ }).first();
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expectToast(page, /deactivated/);
  await expect(row.getByText('Deactivated')).toBeVisible();
  await row.getByRole('button', { name: 'Reactivate' }).click();
  await expectToast(page, /reactivated/);
});

test('is closed to users who are not Super Admins', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});
