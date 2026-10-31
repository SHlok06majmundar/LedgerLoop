import { expect, test } from '@playwright/test';

test.describe('Public website', () => {
  test('landing page explains the product and links to sign-up', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Receivables');
    await expect(page.getByText('How much money is outstanding right now?')).toBeVisible();
    await page.getByRole('link', { name: 'Start free' }).first().click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });

  test('features, pricing and contact pages load from the navigation', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });

    await nav.getByRole('link', { name: 'Features' }).click();
    await expect(page.getByRole('heading', { name: /accounts-receivable layer/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reconciliation you can trust' })).toBeVisible();

    await nav.getByRole('link', { name: 'Pricing' }).click();
    await expect(page.getByText('Most popular')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible();

    await nav.getByRole('link', { name: 'Contact' }).click();
    await expect(page.getByLabel('Work email')).toBeVisible();
  });

  test('contact form validates required fields', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: 'Send message' }).click();
    const valid = await page.getByLabel('Your name').evaluate((el) => (el as HTMLInputElement).validity.valid);
    expect(valid).toBe(false);
  });

  test('switches between light and dark themes', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const before = await html.getAttribute('class');
    await page.getByRole('button', { name: /switch to (dark|light) mode/i }).click();
    await expect(html).not.toHaveAttribute('class', before ?? '');
  });

  test('works on a phone-sized screen with the mobile menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Pricing' }).click();
    await expect(page).toHaveURL(/\/pricing/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('protected pages send signed-out visitors to sign in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });
});
