import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { API, SHLOK } from './support';

/** Expo Router keeps earlier screens mounted but hidden; only act on what is on screen. */
const shown = (locator: Locator) => locator.filter({ visible: true }).first();

/**
 * The Expo app rendered in a phone-sized browser. Creates the requested
 * shlok@gmail.com account through the app's own sign-up screen (or signs in
 * when it already exists from an earlier run), then exercises every tab.
 */
test.describe.configure({ mode: 'serial' });

let page: Page;
const run = Date.now().toString(36).toUpperCase();

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
});
test.afterAll(() => page.close());

async function apiAs(request: APIRequestContext) {
  const login = await request.post(`${API}/auth/login`, { data: { email: SHLOK.email, password: SHLOK.password } });
  const token = (await login.json()).data.accessToken as string;
  const orgs = await request.get(`${API}/organizations`, { headers: { Authorization: `Bearer ${token}` } });
  const orgId = (await orgs.json()).data[0].organization.id as string;
  return { Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId };
}

test('creates the shlok@gmail.com account in the app', async () => {
  await page.goto('/');
  await expect(shown(page.getByRole('button', { name: 'Sign in' }))).toBeVisible({ timeout: 90_000 });
  await shown(page.getByRole('button', { name: 'Create an account' })).click();
  await shown(page.getByLabel('Full name')).fill(SHLOK.name);
  await shown(page.getByLabel('Email')).fill(SHLOK.email);
  await shown(page.getByLabel('Password')).fill(SHLOK.password);
  await shown(page.getByRole('button', { name: 'Create account' })).click();

  const taken = page.getByText('An account with this email already exists');
  const onboarding = page.getByLabel('Business name');
  await expect(taken.or(onboarding)).toBeVisible();
  if (await taken.isVisible()) {
    // Created by an earlier run: sign in instead.
    await shown(page.getByRole('button', { name: 'I already have an account' })).click();
    await shown(page.getByLabel('Email')).fill(SHLOK.email);
    await shown(page.getByLabel('Password')).fill(SHLOK.password);
    await shown(page.getByRole('button', { name: 'Sign in' })).click();
  } else {
    await onboarding.fill('Shlok Enterprises');
    await shown(page.getByRole('button', { name: 'Create business' })).click();
  }
  await expect(shown(page.getByText('Total outstanding'))).toBeVisible();
});

test('shows customers and invoices from the server', async ({ request }) => {
  const headers = await apiAs(request);
  const customer = await request.post(`${API}/customers`, {
    headers,
    data: { name: `Mobile Customer ${run}`, phone: '+91 98765 43210', paymentTermsDays: 7 },
  });
  const customerId = (await customer.json()).data.id as string;
  const invoice = await request.post(`${API}/invoices`, {
    headers,
    data: {
      customerId,
      issueDate: new Date().toISOString().slice(0, 10),
      items: [{ description: 'Mobile test goods', quantityMilli: 1000, unitPriceMinor: 250_000, taxRateBps: 1800 }],
    },
  });
  const invoiceId = (await invoice.json()).data.id as string;
  expect((await request.post(`${API}/invoices/${invoiceId}/issue`, { headers })).ok()).toBe(true);

  await shown(page.getByText('Customers', { exact: true })).click();
  await shown(page.getByLabel('Search customers')).fill(run);
  await shown(page.getByText(`Mobile Customer ${run}`)).click();
  await expect(shown(page.getByText('Open invoices'))).toBeVisible();
  await expect(shown(page.getByText('₹2,950.00'))).toBeVisible();
});

test('records a payment that pays the invoice off', async () => {
  await shown(page.getByRole('button', { name: 'Record payment' })).click();
  await shown(page.getByLabel('Amount received (₹)')).fill('2950');
  await shown(page.getByLabel('Reference (UTR / cheque no.)')).fill(`MOB${run}`);
  await expect(shown(page.getByText('Applied oldest first'))).toBeVisible();
  await expect(shown(page.getByText(/INV-\d{4}-\d{4} · due/))).toBeVisible();
  await shown(page.getByRole('button', { name: 'Record payment' })).click();

  await page.goto('/invoices');
  await shown(page.getByText('Paid', { exact: true })).click();
  await expect(shown(page.getByText(new RegExp(`INV-\\d{4}-\\d{4} · Mobile Customer ${run}`)))).toBeVisible();
});

test('home, reconcile and more tabs work', async () => {
  await page.goto('/');
  await expect(shown(page.getByText('Outstanding by age'))).toBeVisible();
  await shown(page.getByText('Reconcile', { exact: true })).click();
  await expect(shown(page.getByText('Suggested matches waiting for approval'))).toBeVisible();
  await shown(page.getByText('More', { exact: true })).click();
  await expect(shown(page.getByText(SHLOK.email))).toBeVisible();
  await shown(page.getByText('Notifications', { exact: true })).click();
  await expect(shown(page.getByText(/No notifications yet|●/))).toBeVisible();
});

test('signs out and the session ends', async () => {
  await page.goto('/more');
  await shown(page.getByRole('button', { name: 'Sign out' })).click();
  await expect(shown(page.getByRole('button', { name: 'Sign in' }))).toBeVisible();
  await page.reload();
  await expect(shown(page.getByRole('button', { name: 'Sign in' }))).toBeVisible();
});

test('signs back in and the login is restored after a reload', async () => {
  await shown(page.getByLabel('Email')).fill(SHLOK.email);
  await shown(page.getByLabel('Password')).fill(SHLOK.password);
  await shown(page.getByRole('button', { name: 'Sign in' })).click();
  await expect(shown(page.getByText('Total outstanding'))).toBeVisible();
  await page.reload();
  await expect(shown(page.getByText('Total outstanding'))).toBeVisible();
});
