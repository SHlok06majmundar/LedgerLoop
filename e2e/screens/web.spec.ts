import { expect, test, type Page } from '@playwright/test';
import { ACCOUNT, ADMIN, apiReady, capture, hasAccount, hasAdmin } from './shared';

let n = 0;
const shot = (page: Page, name: string, fullPage = true) => capture(page, `web-${String(++n).padStart(2, '0')}`, name, fullPage);

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/);
}

test.describe.configure({ mode: 'serial' });

test('public website', async ({ page }) => {
  for (const [path, name] of [
    ['/', 'home'],
    ['/features', 'features'],
    ['/pricing', 'pricing'],
    ['/contact', 'contact'],
    ['/login', 'sign-in'],
    ['/register', 'create-account'],
    ['/forgot-password', 'forgot-password'],
    ['/reset-password?token=example', 'reset-password'],
    ['/verify-email', 'verify-email'],
  ] as const) {
    await page.goto(path);
    await shot(page, name);
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await shot(page, 'home-dark-mode');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await shot(page, 'home-on-phone');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await shot(page, 'phone-menu', false);
});

test('business app screens', async ({ page }) => {
  test.skip(!hasAccount(), 'Set SCREENS_EMAIL and SCREENS_PASSWORD');
  test.skip(!(await apiReady()), 'API/database not reachable: in-app screens skipped');
  await signIn(page, ACCOUNT.email, ACCOUNT.password);

  await page.goto('/dashboard');
  await expect(page.getByText('Total outstanding')).toBeVisible();
  await shot(page, 'dashboard');
  await page.getByRole('button', { name: /shlok|trader|organization/i }).first().click();
  await shot(page, 'organization-switcher', false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await shot(page, 'notifications', false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await shot(page, 'account-menu', false);
  await page.keyboard.press('Escape');

  // Customers
  await page.goto('/customers');
  await shot(page, 'customers');
  await page.getByRole('button', { name: 'Add customer' }).click();
  await shot(page, 'add-customer-form', false);
  await page.keyboard.press('Escape');
  const customer = page.locator('a[href^="/customers/"]').first();
  if (await customer.count()) {
    await customer.click();
    await page.waitForURL(/\/customers\/[a-f\d]{24}$/);
    for (const tab of ['Overview', 'Invoices', 'Payments', 'Reconciliation', 'Activity history']) {
      const t = page.getByRole('tab', { name: tab });
      if (await t.count()) {
        await t.click();
        await shot(page, `customer-${tab.toLowerCase().replace(' ', '-')}`);
      }
    }
    await page.getByRole('button', { name: 'Edit' }).click();
    await shot(page, 'edit-customer-form', false);
    await page.keyboard.press('Escape');
  }

  // Invoices
  await page.goto('/invoices');
  await shot(page, 'invoices');
  await page.goto('/invoices?status=OVERDUE');
  await shot(page, 'invoices-overdue-filter');
  await page.goto('/invoices/new');
  await page.getByLabel('Line 1 description').fill('OPC Cement 53 Grade (50 kg bag)');
  await page.getByLabel('Line 1 quantity').fill('50');
  await page.getByLabel('Line 1 unit price').fill('400');
  await shot(page, 'new-invoice-editor');
  const invoice = page.locator('a[href^="/invoices/"]');
  await page.goto('/invoices');
  if (await invoice.first().count()) {
    await invoice.first().click();
    await page.waitForURL(/\/invoices\/[a-f\d]{24}$/);
    await shot(page, 'invoice-detail');
    const email = page.getByRole('button', { name: 'Email' });
    if (await email.count()) {
      await email.click();
      await shot(page, 'email-invoice-dialog', false);
      await page.keyboard.press('Escape');
    }
    const more = page.getByRole('button', { name: 'More actions' });
    if (await more.count()) {
      await more.click();
      await shot(page, 'invoice-more-actions', false);
      await page.keyboard.press('Escape');
    }
  }

  // Payments
  await page.goto('/payments');
  await shot(page, 'payments');
  await page.goto('/payments/new');
  await shot(page, 'record-payment');
  await page.goto('/payments');
  const payment = page.locator('a[href^="/payments/"]').filter({ hasText: /PAY-/ });
  if (await payment.count()) {
    await payment.first().click();
    await page.waitForURL(/\/payments\/[a-f\d]{24}$/);
    await shot(page, 'payment-detail');
  }

  // Reconciliation
  for (const [view, name] of [
    ['exceptions', 'reconciliation-exceptions'],
    ['suggestions', 'reconciliation-suggested-matches'],
    ['transactions', 'reconciliation-bank-transactions'],
    ['runs', 'reconciliation-runs'],
  ] as const) {
    await page.goto(`/reconciliation?view=${view}`);
    await shot(page, name);
  }
  const exceptionRow = page.locator('button[aria-expanded]');
  await page.goto('/reconciliation');
  if (await exceptionRow.count()) {
    await exceptionRow.first().click();
    await shot(page, 'exception-opened');
  }
  await page.goto('/reconciliation/imports');
  await shot(page, 'statement-imports');
  await page.goto('/reconciliation/imports/new');
  await shot(page, 'import-statement-upload');
  await page.goto('/reconciliation/imports');
  const importLink = page.locator('a[href^="/reconciliation/imports/"]').filter({ hasText: /\.csv/i });
  if (await importLink.count()) {
    await importLink.first().click();
    await page.waitForURL(/\/imports\/[a-f\d]{24}$/);
    await shot(page, 'import-result');
  }

  // Collections, analytics, settings
  await page.goto('/collections');
  await shot(page, 'collections');
  await page.getByRole('button', { name: 'Send reminder' }).click();
  await shot(page, 'send-reminder-dialog', false);
  await page.keyboard.press('Escape');
  await page.goto('/analytics');
  await shot(page, 'analytics');
  await page.goto('/settings');
  for (const tab of ['Profile', 'Organization', 'Members', 'Audit log']) {
    const t = page.getByRole('tab', { name: tab });
    if (await t.count()) {
      await t.click();
      await shot(page, `settings-${tab.toLowerCase().replace(' ', '-')}`);
    }
  }
  await page.goto('/onboarding');
  await shot(page, 'create-organization');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await shot(page, 'dashboard-on-phone');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await shot(page, 'app-menu-on-phone', false);
});

test('admin panel screens', async ({ page }) => {
  test.skip(!hasAdmin(), 'Set SCREENS_ADMIN_EMAIL and SCREENS_ADMIN_PASSWORD');
  test.skip(!(await apiReady()), 'API/database not reachable: admin screens skipped');
  await signIn(page, ADMIN.email, ADMIN.password);
  for (const [path, name] of [
    ['/admin', 'admin-overview'],
    ['/admin/organizations', 'admin-organizations'],
    ['/admin/users', 'admin-users'],
  ] as const) {
    await page.goto(path);
    await shot(page, name);
  }
});

