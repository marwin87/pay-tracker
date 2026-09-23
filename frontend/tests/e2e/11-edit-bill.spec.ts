/**
 * Flow 11: Edit an existing bill template — amount, category, frequency, due day, pause
 * Risk: the edit form saves only a subset of the changed fields, or the list keeps
 *       showing stale values / the old category grouping after a successful save.
 * Real boundaries: auth, PATCH /bills/:id, bills list re-fetch and category grouping.
 * Each test uses a fresh isolated user → exactly one bill on the list.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi } from './helpers';

test('editing a bill persists amount, category, frequency, due day and pause', async ({ page }) => {
  const billName = `E2E Edit ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName); // utilities, monthly, 99.99 PLN, due day 15

  await page.goto('/dashboard/bills');
  await expect(page.getByText(billName)).toBeVisible();

  // Step: open the inline edit form (Edit is hover-revealed on sm+)
  await page.getByText(billName).hover();
  await page.getByRole('button', { name: 'Edit' }).click();

  // Step: amount
  await page.getByLabel('Amount').fill('150.00');

  // Step: category (custom listbox)
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Housing' }).click();

  // Step: cycle
  await page.getByRole('button', { name: 'Quarterly' }).click();

  // Step: due day — the trigger shows the current "month day" (due_month defaults to now)
  const monthName = new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date());
  await page.getByRole('button', { name: new RegExp(`${monthName} 15|15 ${monthName}`) }).click();
  await page.getByRole('button', { name: '20', exact: true }).click();

  // Step: pause
  // (custom checkbox: the native input is sr-only, so click its label text)
  await page.getByText('Pause recurrence (no new instances created)').click();

  await page.getByRole('button', { name: 'Save' }).click();

  // Assert: every edited field is reflected on the collapsed row
  await expect(page.getByText('150.00 PLN')).toBeVisible();
  await expect(page.getByText('Quarterly')).toBeVisible();
  await expect(page.getByText('Paused')).toBeVisible();
  await expect(page.getByText(/Due on/)).toContainText('20');

  // Assert: persisted (not just optimistic) and regrouped under the new category
  await page.reload();
  await expect(page.getByText(billName)).toBeVisible();
  await expect(page.getByText('150.00 PLN')).toBeVisible();
  await expect(page.getByText('Housing', { exact: true })).toBeVisible();
  await expect(page.getByText('Utilities', { exact: true })).not.toBeVisible();
});
