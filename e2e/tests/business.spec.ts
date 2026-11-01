import { expect, test, type Page } from '@playwright/test';
import { expectToast, statementDate, TEST_PASSWORD, testEmail } from './support';

/**
 * One business journey through the web app, in order: sign-up, customers,
 * invoices, payments, statement import and reconciliation, collections,
 * analytics and settings.
 */
test.describe.configure({ mode: 'serial' });

const run = Date.now().toString(36).toUpperCase();
const owner = { name: 'E2E Owner', email: testEmail('owner'), org: `E2E Traders ${run}` };
const customerName = `Sharma Wholesale ${run}`;
let page: Page;
let customerUrl = '';
let firstInvoiceUrl = '';
let reconInvoiceNumber = '';

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(() => page.close());

async function createInvoice(description: string, quantity: string, unitPrice: string) {
  await page.goto(customerUrl);
  await page.getByRole('link', { name: 'New invoice' }).click();
  await expect(page).toHaveURL(/\/invoices\/new/);
  await expect(page.getByLabel('Customer', { exact: true })).toHaveValue(/[a-f\d]{24}/);
  await page.getByLabel('Line 1 description').fill(description);
  await page.getByLabel('Line 1 quantity').fill(quantity);
  await page.getByLabel('Line 1 unit price').fill(unitPrice);
  await page.getByRole('button', { name: 'Save and issue' }).click();
  await page.waitForURL(/\/invoices\/[a-f\d]{24}$/);
  await expect(page.getByText('Issued', { exact: true })).toBeVisible();
  return (await page.getByRole('heading', { level: 1 }).innerText()).match(/INV-\d{4}-\d{4}/)![0];
}

test('signs up and creates the first organization', async () => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(owner.name);
  await page.getByLabel('Work email').fill(owner.email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel('Business name').fill(owner.org);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText('Total outstanding')).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(owner.org) })).toBeVisible();
});

test('rejects a weak password with a clear message', async ({ browser }) => {
  const other = await browser.newPage();
  await other.goto('/register');
  await other.getByLabel('Full name').fill('Weak Pass');
  await other.getByLabel('Work email').fill(testEmail('weak'));
  await other.getByLabel('Password').fill('short');
  await other.getByRole('button', { name: 'Create account' }).click();
  await expect(other.getByText(/at least 10 characters/i).first()).toBeVisible();
  await other.close();
});

test('adds, edits, archives and restores a customer', async () => {
  await page.goto('/customers');
  await page.getByRole('button', { name: 'Add customer' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Customer name').fill(`${customerName} Draft`);
  await dialog.getByLabel('Email').fill(testEmail('customer'));
  await dialog.getByLabel('GSTIN').fill('27AAPFU0939F1ZV');
  await dialog.getByLabel('Payment terms (days)').fill('15');
  await dialog.getByRole('button', { name: 'Add customer' }).click();
  await page.waitForURL(/\/customers\/[a-f\d]{24}$/);
  customerUrl = page.url();
  await expect(page.getByRole('heading', { name: `${customerName} Draft` })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByLabel('Customer name').fill(customerName);
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: customerName })).toBeVisible();

  await page.getByRole('button', { name: 'Archive' }).click();
  await expectToast(page, 'Customer archived');
  await expect(page.getByText('Archived').first()).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expectToast(page, 'Customer restored');

  await page.goto('/customers');
  await page.getByRole('searchbox').fill(run);
  await expect(page.getByRole('link', { name: customerName })).toBeVisible();
});

test('creates, issues, downloads and emails an invoice', async () => {
  const number = await createInvoice('Steel rods', '2', '1000');
  firstInvoiceUrl = page.url();
  // 2 x ₹1,000 + 18% GST
  await expect(page.getByText('₹2,360.00').first()).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF' }).click();
  expect((await download).suggestedFilename()).toBe(`${number}.pdf`);

  await page.getByRole('button', { name: 'Email' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expectToast(page, 'Invoice email queued');
});

test('records a payment, applies it oldest first, then reverses it', async () => {
  await page.goto(firstInvoiceUrl);
  await page.getByRole('link', { name: 'Record payment' }).click();
  await page.waitForURL(/\/payments\/new/);
  await page.getByLabel('Amount received (₹)').fill('1000');
  await page.getByLabel('Reference').fill(`UTR${run}`);
  await page.getByRole('button', { name: 'Oldest first' }).click();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.waitForURL(/\/payments\/[a-f\d]{24}$/);
  await expect(page.getByText('Allocated', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('₹1,000.00').first()).toBeVisible();

  await page.getByRole('button', { name: 'Reverse', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reason').fill('Applied to the wrong invoice');
  await page.getByRole('dialog').getByRole('button', { name: 'Record reversal' }).click();
  await expectToast(page, 'Reversal recorded');
  await expect(page.getByText('Reversed', { exact: true }).first()).toBeVisible();
});

test('blocks a duplicate payment reference', async () => {
  await page.goto(`/payments/new?customerId=${customerUrl.split('/').pop()}`);
  await page.getByLabel('Amount received (₹)').fill('10');
  await page.getByLabel('Reference').fill(`UTR${run}`);
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expectToast(page, /already recorded/);
});

test('imports a bank statement and approves the suggested match', async () => {
  reconInvoiceNumber = await createInvoice('Cement bags', '10', '500');
  const reconInvoiceUrl = page.url();

  const csv = [
    'Date,Narration,Ref,Withdrawal,Deposit',
    `${statementDate(4)},NEFT CR ${customerName.toUpperCase()} ${reconInvoiceNumber},,,"5,900.00"`,
    `${statementDate(4)},INTEREST CREDIT ${run},,,12.00`,
  ].join('\n');

  await page.goto('/reconciliation/imports/new');
  await page.locator('input[type=file]').setInputFiles({ name: `statement-${run}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('2 rows found')).toBeVisible();
  await expect(page.getByLabel('Deposit (credit) column')).toHaveValue('Deposit');
  await page.getByRole('button', { name: 'Import 2 rows' }).click();
  await page.waitForURL(/\/reconciliation\/imports\/[a-f\d]{24}$/);
  await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 60_000 });

  await expect(async () => {
    await page.goto('/reconciliation?view=suggestions');
    await expect(page.getByRole('link', { name: new RegExp(reconInvoiceNumber) })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  const card = page.locator('div.rounded-xl', { has: page.getByRole('link', { name: new RegExp(reconInvoiceNumber) }) }).first();
  await expect(card.getByText('Narration names')).toBeVisible();
  await card.getByRole('button', { name: 'Approve match' }).click();
  await expectToast(page, 'Match approved');

  await page.goto(reconInvoiceUrl);
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
});

test('reviews an exception: comments on it and ignores it', async () => {
  await page.goto('/reconciliation');
  const row = page.getByRole('button', { name: new RegExp(`INTEREST CREDIT ${run}`, 'i') });
  await row.click();
  await page.getByRole('textbox', { name: 'Comment' }).fill('Bank interest, not a customer payment');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByText('Bank interest, not a customer payment')).toBeVisible();
  await page.getByRole('button', { name: 'Ignore' }).click();
  await page.getByRole('dialog').getByLabel('Reason').fill('Bank interest');
  await page.getByRole('dialog').getByRole('button', { name: 'Ignore credit' }).click();
  await expectToast(page, 'Marked as not a customer payment');
});

test('runs collections, saves the schedule and sends a manual reminder', async () => {
  await page.goto('/collections');
  await page.getByRole('button', { name: 'Run now' }).click();
  await expectToast(page, 'Due reminders queued');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expectToast(page, 'Reminder schedule saved');

  await page.getByRole('button', { name: 'Send reminder' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Search customers').fill(run);
  const option = dialog.locator('select#rem-customer option', { hasText: customerName });
  await expect(option).toHaveCount(1);
  await dialog.locator('select#rem-customer').selectOption((await option.getAttribute('value'))!);
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByLabel('Personal note (optional)').fill('Friendly reminder from the e2e run');
  await dialog.getByRole('button', { name: 'Send reminder' }).click();
  await expectToast(page, 'Reminder is being sent');
});

test('edits the details of a payment', async () => {
  await page.goto(`/payments/new?customerId=${customerUrl.split('/').pop()}`);
  await page.getByLabel('Amount received (₹)').fill('25');
  await page.getByLabel('Reference').fill(`TYPO${run}`);
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.waitForURL(/\/payments\/[a-f\d]{24}$/);

  await page.getByRole('button', { name: 'Edit details' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Method').selectOption('UPI');
  await dialog.getByLabel('Reference (UTR / cheque no.)').fill(`FIXED${run}`);
  await dialog.getByLabel('Notes').fill('Customer sent the corrected UTR');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Payment updated');
  await expect(page.getByText(`FIXED${run}`).first()).toBeVisible();
  await expect(page.getByText('Customer sent the corrected UTR')).toBeVisible();
});

test('deletes a draft invoice', async () => {
  await page.goto(customerUrl);
  await page.getByRole('link', { name: 'New invoice' }).click();
  await page.getByLabel('Line 1 description').fill('Sample order, not confirmed');
  await page.getByLabel('Line 1 quantity').fill('1');
  await page.getByLabel('Line 1 unit price').fill('500');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await page.waitForURL(/\/invoices\/[a-f\d]{24}$/);
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Void invoice' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Delete draft' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete draft' }).click();
  await expectToast(page, 'Draft deleted');
  await page.waitForURL(/\/invoices$/);
});

test('voids the unpaid invoice with a reason', async () => {
  await page.goto(firstInvoiceUrl);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Void invoice' }).click();
  await page.getByRole('dialog').getByLabel('Reason').fill('Order cancelled by customer');
  await page.getByRole('dialog').getByRole('button', { name: 'Void invoice' }).click();
  await expectToast(page, 'Invoice voided');
  await expect(page.getByText(/This invoice was voided/)).toBeVisible();
});

test('shows dashboard and analytics figures', async () => {
  await page.goto('/dashboard');
  await expect(page.getByText('Payments received')).toBeVisible();
  await expect(page.getByText('Invoiced vs received')).toBeVisible();
  await page.goto('/analytics');
  await expect(page.getByText('Invoiced, received and still outstanding')).toBeVisible();
  await expect(page.getByText('Match rate')).toBeVisible();
  await page.getByRole('button', { name: 'Table' }).first().click();
  await expect(page.getByRole('table', { name: 'Invoiced vs received by month' })).toBeVisible();
});

test('updates profile, organization details and invites a teammate', async () => {
  await page.goto('/settings');
  await page.getByLabel('Name').fill('E2E Owner Renamed');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expectToast(page, 'Profile updated');

  await page.getByRole('tab', { name: 'Organization' }).click();
  await page.getByLabel('Billing email').fill(testEmail('billing'));
  await page.getByLabel('Address').fill('12 MG Road, Pune 411001');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expectToast(page, 'Organization updated');

  await page.getByRole('tab', { name: 'Members' }).click();
  const invitee = testEmail('invitee');
  await page.getByLabel('Email').fill(invitee);
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expectToast(page, `Invitation sent to ${invitee}`);
  await expect(page.getByRole('cell', { name: invitee })).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expectToast(page, 'Invitation revoked');

  await page.getByRole('tab', { name: 'Audit log' }).click();
  await expect(page.getByText('invoice.voided').first()).toBeVisible();
});

test('signs out', async () => {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

