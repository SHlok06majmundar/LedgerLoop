import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A sample month for a wholesale business, done through the real website:
 * customers → invoices → a cheque payment → bank statement import →
 * reconciliation → exceptions → reminders → dashboard.
 */
const EMAIL = process.env.WALKTHROUGH_EMAIL!;
const PASSWORD = process.env.WALKTHROUGH_PASSWORD!;
const OUT = join(__dirname, '..', '..', 'walkthrough');
const inbox = (tag: string) => EMAIL.replace('@', `+${tag}@`);

let step = 0;
async function shot(page: Page, name: string) {
  step += 1;
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: true });
}

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const bankDate = (days: number) => {
  const [y, m, d] = iso(days).split('-');
  return `${d}/${m}/${y}`;
};
const toast = (page: Page, text: string | RegExp) =>
  expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();

async function addCustomer(page: Page, c: { name: string; email: string; gstin: string; phone: string; terms: string }) {
  await page.goto('/customers');
  await page.getByRole('button', { name: 'Add customer' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Customer name').fill(c.name);
  await d.getByLabel('Email').fill(c.email);
  await d.getByLabel('Phone').fill(c.phone);
  await d.getByLabel('GSTIN').fill(c.gstin);
  await d.getByLabel('Payment terms (days)').fill(c.terms);
  await d.getByLabel('Address line 1').fill('Plot 14, Market Yard');
  await d.getByLabel('City').fill('Pune');
  await d.getByLabel('State').fill('Maharashtra');
  await d.getByRole('button', { name: 'Add customer' }).click();
  await page.waitForURL(/\/customers\/[a-f\d]{24}$/);
  return page.url();
}

async function addInvoice(
  page: Page,
  customerUrl: string,
  inv: { issue: number; due: number; lines: [string, string, string][] },
) {
  await page.goto(`/invoices/new?customerId=${customerUrl.split('/').pop()}`);
  await expect(page.getByLabel('Customer', { exact: true })).toHaveValue(/[a-f\d]{24}/);
  await page.getByLabel('Issue date').fill(iso(inv.issue));
  await page.getByLabel('Due date').fill(iso(inv.due));
  for (const [i, [description, qty, price]] of inv.lines.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByLabel(`Line ${i + 1} description`).fill(description);
    await page.getByLabel(`Line ${i + 1} quantity`).fill(qty);
    await page.getByLabel(`Line ${i + 1} unit price`).fill(price);
  }
  return page;
}

async function issueAndRead(page: Page) {
  await page.getByRole('button', { name: 'Save and issue' }).click();
  await page.waitForURL(/\/invoices\/[a-f\d]{24}$/);
  const number = (await page.getByRole('heading', { level: 1 }).innerText()).match(/INV-\d{4}-\d{4}/)![0];
  return { number, url: page.url() };
}

test('a month of receivables in LedgerLoop', async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, 'Set WALKTHROUGH_EMAIL and WALKTHROUGH_PASSWORD');
  mkdirSync(OUT, { recursive: true });

  // 1. Sign in
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await shot(page, 'sign-in');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText('Total outstanding')).toBeVisible();
  await shot(page, 'empty-dashboard');

  // 2. Customers
  const sharma = await addCustomer(page, { name: 'Sharma Wholesale', email: inbox('sharma'), gstin: '27AAPFS1234K1ZV', phone: '+91 98220 11111', terms: '15' });
  await shot(page, 'customer-sharma');
  const gupta = await addCustomer(page, { name: 'Gupta Electricals', email: inbox('gupta'), gstin: '27AABCG5678L1ZQ', phone: '+91 98220 22222', terms: '30' });
  const patel = await addCustomer(page, { name: 'Patel Hardware', email: inbox('patel'), gstin: '27AAKFP9012M1Z5', phone: '+91 98220 33333', terms: '15' });
  await page.goto('/customers');
  await shot(page, 'customers-list');

  // 3. Invoices (GST 18% is the default rate)
  await addInvoice(page, sharma, { issue: -10, due: 5, lines: [['OPC Cement 53 Grade (50 kg bag)', '50', '400']] });
  await shot(page, 'invoice-editor-live-totals');
  const inv1 = await issueAndRead(page);
  await shot(page, 'invoice-issued-sharma');

  await page.getByRole('button', { name: 'Email' }).click();
  await page.getByRole('dialog').getByLabel('Personal note (optional)').fill('Thank you for your order. Bank details are in the PDF.');
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await toast(page, 'Invoice email queued');

  await addInvoice(page, gupta, { issue: -12, due: 18, lines: [['Copper wire 1.5 sq mm (90 m coil)', '10', '1500']] });
  const inv2 = await issueAndRead(page);
  await addInvoice(page, gupta, { issue: -12, due: 18, lines: [['Modular switch 6A', '24', '250']] });
  const inv3 = await issueAndRead(page);
  await addInvoice(page, patel, { issue: -40, due: -25, lines: [['Power tools kit (drill, grinder, saw)', '1', '30000']] });
  const inv4 = await issueAndRead(page);
  await shot(page, 'invoice-overdue-patel');
  await page.goto('/invoices');
  await shot(page, 'invoices-list');

  // 4. Patel pays part by cheque; recorded by hand
  await page.goto(`/payments/new?customerId=${patel.split('/').pop()}`);
  await page.getByLabel('Amount received (₹)').fill('10000');
  await page.getByLabel('Payment date').fill(iso(-3));
  await page.getByLabel('Method').selectOption('CHEQUE');
  await page.getByLabel('Reference').fill('CHQ004512');
  await page.getByLabel('Notes').fill('Cheque handed over at the shop');
  await page.getByRole('button', { name: 'Oldest first' }).click();
  await shot(page, 'record-cheque-payment');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.waitForURL(/\/payments\/[a-f\d]{24}$/);
  await shot(page, 'payment-recorded');

  // 5. Bank statement for the month (HDFC-style export with a preamble)
  const csv = [
    'HDFC BANK Ltd.',
    'Statement of account: SHLOK TRADER',
    'Account No : 50100xxxxxx789',
    '',
    'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    `${bankDate(-6)},NEFT CR-SBIN0004521-SHARMA WHOLESALE-${inv1.number},SBIN526110745,${bankDate(-6)},,"23,600.00","1,23,600.00"`,
    `${bankDate(-5)},RTGS CR-HDFC0001234-GUPTA ELECTRICALS-${inv2.number} ${inv3.number},HDFCR52026110,${bankDate(-5)},,"24,780.00","1,48,380.00"`,
    `${bankDate(-3)},CHQ DEP-PATEL HARDWARE-CLG,CHQ004512,${bankDate(-3)},,"10,000.00","1,58,380.00"`,
    `${bankDate(-2)},CHGS: SMS ALERT CHARGES,,${bankDate(-2)},17.70,,"1,58,362.30"`,
    `${bankDate(-2)},INT.PD:SAVINGS INTEREST,,${bankDate(-2)},,45.00,"1,58,407.30"`,
    `${bankDate(-1)},NEFT CR-ICIC0000456-R K TRADERS-ADVANCE,ICIC526110911,${bankDate(-1)},,"5,000.00","1,63,407.30"`,
  ].join('\n');
  writeFileSync(join(OUT, 'sample-bank-statement.csv'), csv);

  await page.goto('/reconciliation/imports/new');
  await shot(page, 'import-upload');
  await page.locator('input[type=file]').setInputFiles(join(OUT, 'sample-bank-statement.csv'));
  await expect(page.getByText('6 rows found')).toBeVisible();
  await shot(page, 'import-column-mapping');
  await page.getByRole('button', { name: 'Import 6 rows' }).click();
  await page.waitForURL(/\/reconciliation\/imports\/[a-f\d]{24}$/);
  await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 90_000 });
  await shot(page, 'import-finished');

  // 6. Reconciliation: suggestions waiting for approval
  await expect(async () => {
    await page.goto('/reconciliation?view=suggestions');
    await expect(page.getByRole('button', { name: 'Approve match' }).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
  await shot(page, 'suggested-matches');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Approve match' }).first().click();
    await toast(page, 'Match approved');
    await page.waitForTimeout(800);
  }
  await page.goto('/reconciliation?view=transactions');
  await shot(page, 'bank-transactions-after-matching');

  // 7. Exceptions: comment on and ignore the bank interest, leave R K Traders for a person to decide
  await page.goto('/reconciliation');
  await page.getByRole('button', { name: /SAVINGS INTEREST/ }).click();
  await page.getByRole('textbox', { name: 'Comment' }).fill('Bank interest, not a customer payment');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await shot(page, 'exception-review');
  await page.getByRole('button', { name: 'Ignore' }).click();
  await page.getByRole('dialog').getByLabel('Reason').fill('Savings interest from the bank');
  await page.getByRole('dialog').getByRole('button', { name: 'Ignore credit' }).click();
  await toast(page, 'Marked as not a customer payment');
  await page.goto('/reconciliation');
  await shot(page, 'open-exceptions-left');

  // 8. Invoices after the month
  await page.goto(inv1.url);
  await shot(page, 'invoice-paid-by-bank-match');
  await page.goto(inv4.url);
  await shot(page, 'invoice-partly-paid-overdue');

  // 9. Collections: send due reminders now (Patel is 25 days overdue)
  await page.goto('/collections');
  await page.getByRole('button', { name: 'Run now' }).click();
  await toast(page, 'Due reminders queued');
  await page.waitForTimeout(4000);
  await page.reload();
  await shot(page, 'collections-reminders');

  // 10. The overview
  await page.goto('/dashboard');
  await expect(page.getByText('Total outstanding')).toBeVisible();
  await shot(page, 'dashboard-after-month');
  await page.goto('/analytics');
  await shot(page, 'analytics');
  await page.goto('/payments');
  await shot(page, 'payments-list');
});
