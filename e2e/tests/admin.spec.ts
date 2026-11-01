import { expect, test, type Page } from '@playwright/test';
import { API, expectToast, promoteSuperAdmin, SHLOK, signInWeb, TEST_PASSWORD, testEmail } from './support';

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

/** Searches the list and opens the actions menu of the first matching row. */
async function rowAction(page: Page, search: string, action: string) {
  await page.getByRole('searchbox').fill(search);
  const row = page.getByRole('row').filter({ hasText: search }).first();
  await row.getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: action }).click();
  return row;
}

/** A throwaway account with its own organization, made through the API. */
async function throwawayAccount() {
  const email = testEmail('delete-me');
  const register = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Delete Me', email, password: TEST_PASSWORD }),
  });
  const token = ((await register.json()) as { data: { accessToken: string } }).data.accessToken;
  const organization = `Closing Down ${Date.now().toString(36)}`;
  await fetch(`${API}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: organization }),
  });
  return { email, organization };
}

test('suspends and restores an organization', async ({ page }) => {
  await signInWeb(page, SHLOK.email, SHLOK.password);
  await page.goto('/admin/organizations');
  const row = await rowAction(page, 'E2E Traders', 'Suspend');
  await expectToast(page, /suspended/);
  await expect(row.getByText('Suspended')).toBeVisible();
  await rowAction(page, 'E2E Traders', 'Restore access');
  await expectToast(page, /restored/);
});

test('renames an organization', async ({ page }) => {
  const account = await throwawayAccount();
  await signInWeb(page, SHLOK.email, SHLOK.password);
  await page.goto('/admin/organizations');
  await rowAction(page, account.organization, 'Rename');
  await page.getByRole('dialog').getByLabel('Name').fill(`${account.organization} Pvt Ltd`);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Organization renamed');
  await expect(page.getByText(`${account.organization} Pvt Ltd`)).toBeVisible();
});

test('deletes an organization after typing its name', async ({ page }) => {
  const account = await throwawayAccount();
  await signInWeb(page, SHLOK.email, SHLOK.password);
  await page.goto('/admin/organizations');
  await rowAction(page, account.organization, 'Delete organization');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Delete organization' })).toBeDisabled();
  await dialog.getByLabel(/Type ".*" to confirm/).fill(account.organization);
  await dialog.getByRole('button', { name: 'Delete organization' }).click();
  await expectToast(page, /deleted/);
  await expect(page.getByRole('row').filter({ hasText: account.organization })).toHaveCount(0);
});

test('deactivates and reactivates a user', async ({ page }) => {
  await signInWeb(page, SHLOK.email, SHLOK.password);
  await page.goto('/admin/users');
  const row = await rowAction(page, 'e2e-owner', 'Deactivate');
  await expectToast(page, /deactivated/);
  await expect(row.getByText('Deactivated')).toBeVisible();
  await rowAction(page, 'e2e-owner', 'Reactivate');
  await expectToast(page, /reactivated/);
});

test('edits a user and then deletes them, freeing the email', async ({ page }) => {
  const account = await throwawayAccount();
  await signInWeb(page, SHLOK.email, SHLOK.password);
  await page.goto('/admin/users');
  await rowAction(page, account.email, 'Edit');
  await page.getByRole('dialog').getByLabel('Name').fill('Renamed Person');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'User updated');

  await rowAction(page, account.email, 'Delete user');
  await page.getByRole('dialog').getByLabel(/Type ".*" to confirm/).fill(account.email);
  await page.getByRole('dialog').getByRole('button', { name: 'Delete user' }).click();
  await expectToast(page, 'Renamed Person deleted');
  await expect(page.getByRole('row').filter({ hasText: account.email })).toHaveCount(0);

  const again = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Back Again', email: account.email, password: TEST_PASSWORD }),
  });
  expect(again.status).toBe(201);
});

test('is closed to users who are not Super Admins', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});
