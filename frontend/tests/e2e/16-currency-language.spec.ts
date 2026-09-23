/**
 * Flow 16: Settings → Preferences — default currency and UI language
 * Risk: the chosen currency/language is applied only in memory and is lost on reload
 *       (new bills default to the wrong currency, UI reverts to English).
 * Real boundaries: auth, PATCH /auth/me, locale/profile context, reload.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser } from './helpers';

test('default currency change is saved and pre-selected in a new bill', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings');
  await page.getByRole('tab', { name: 'Preferences', exact: true }).click();

  // Step: pick PLN in the Currency dropdown and save
  await page.getByRole('button', { name: 'Currency', exact: true }).click();
  await page.getByRole('option', { name: /PLN/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).not.toBeVisible();

  // Assert: persisted across reload
  await page.reload();
  await expect(page.getByText('PLN — Polish Złoty')).toBeVisible();

  // Assert: a new bill form is pre-filled with the saved default currency
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: 'New Bill' }).click();
  await expect(page.getByText('PLN — Polish Złoty')).toBeVisible();
});

test('switching language to Polski applies immediately and persists after reload', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/payments');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // Step: switch via the nav language toggle (rendered twice: desktop + mobile)
  await page.getByRole('button', { name: 'Switch language' }).first().click();
  await page.getByRole('option', { name: /Polski/ }).click();

  // Assert: applied immediately
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

  // Assert: saved on the account — survives a reload and a different page
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.goto('/dashboard/bills');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

  // Step: switch back to English
  await page.getByRole('button', { name: /Switch language|Zmień język/ }).first().click();
  await page.getByRole('option', { name: /English/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
