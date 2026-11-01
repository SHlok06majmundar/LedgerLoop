import { expect, test, type Locator, type Page } from '@playwright/test';
import { ACCOUNT, apiReady, capture, hasAccount } from './shared';

let n = 0;
const shot = (page: Page, name: string) => capture(page, `mobile-${String(++n).padStart(2, '0')}`, name, false);
/** Expo Router keeps earlier screens mounted but hidden; act on what is on screen. */
const shown = (locator: Locator) => locator.filter({ visible: true }).first();

test.describe.configure({ mode: 'serial' });

test('sign-in and sign-up screens', async ({ page }) => {
  await page.goto('/');
  await expect(shown(page.getByRole('button', { name: 'Sign in' }))).toBeVisible({ timeout: 120_000 });
  await shot(page, 'sign-in');
  await shown(page.getByRole('button', { name: 'Create an account' })).click();
  await expect(shown(page.getByLabel('Full name'))).toBeVisible();
  await shot(page, 'create-account');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'create-account-dark-mode');
  await page.emulateMedia({ colorScheme: 'light' });
});

test('app screens', async ({ page }) => {
  test.skip(!hasAccount(), 'Set SCREENS_EMAIL and SCREENS_PASSWORD');
  test.skip(!(await apiReady()), 'API/database not reachable: app screens skipped');
  await page.goto('/login');
  await shown(page.getByLabel('Email')).fill(ACCOUNT.email);
  await shown(page.getByLabel('Password')).fill(ACCOUNT.password);
  await shown(page.getByRole('button', { name: 'Sign in' })).click();
  await expect(shown(page.getByText('Total outstanding'))).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, 'home');
  await page.mouse.wheel(0, 900);
  await shot(page, 'home-scrolled');

  await shown(page.getByText('Invoices', { exact: true })).click();
  await shot(page, 'invoices-open');
  for (const filter of ['Overdue', 'Paid', 'All']) {
    await shown(page.getByRole('tab', { name: filter, exact: true })).click();
    await shot(page, `invoices-${filter.toLowerCase()}`);
  }
  const invoiceRow = shown(page.getByText(/INV-\d{4}-\d{4}/));
  if (await invoiceRow.count()) {
    await invoiceRow.click();
    await page.waitForTimeout(1200);
    await shot(page, 'invoice-detail');
    await page.goBack();
  }

  await shown(page.getByText('Customers', { exact: true })).click();
  await shot(page, 'customers');
  const customerRow = page.getByRole('button').filter({ hasText: /Wholesale|Electricals|Hardware|Traders|Customer/ });
  if (await customerRow.count()) {
    await shown(customerRow).click();
    await page.waitForTimeout(1200);
    await shot(page, 'customer-detail');
    const pay = shown(page.getByRole('button', { name: 'Record payment' }));
    if (await pay.count()) {
      await pay.click();
      await page.waitForTimeout(1200);
      await shown(page.getByLabel('Amount received (₹)')).fill('2500');
      await page.waitForTimeout(800);
      await shot(page, 'record-payment');
      await page.goBack();
    }
  }

  await page.goto('/reconcile');
  await page.waitForTimeout(1500);
  await shot(page, 'reconcile');
  await page.goto('/more');
  await page.waitForTimeout(1200);
  await shot(page, 'more');
  await page.goto('/notifications');
  await page.waitForTimeout(1200);
  await shot(page, 'notifications');
});
