/**
 * Flow 3: Mark a payment paid → status changes
 * Risk: optimistic UI update not reflected — "Mark as Paid" stays after payment
 *       is recorded, or "Revert payment" never appears.
 * Real boundaries: auth, POST /bills/payments/:id/pay, UI state re-render.
 * Each test uses a fresh isolated user → exactly one payment row on the page.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('marking a payment paid replaces Mark as Paid with Revert payment', async ({ page }) => {
  const billName = `E2E Paid ${Date.now()}`;

  // Setup: authenticate + create bill + sync instances via API
  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  // Step: navigate to payments page
  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName)).toBeVisible();

  // Step: click "Mark as Paid" (only one row → no ambiguity)
  await page.getByRole('button', { name: 'Mark as Paid' }).click();

  // MarkPaidDialog appears — confirm
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Mark as Paid' }).click();

  // Assert: "Revert payment" button appears (status changed to paid)
  await expect(page.getByLabel('Revert payment')).toBeVisible();

  // Assert: "Mark as Paid" button is gone
  await expect(page.getByRole('button', { name: 'Mark as Paid' })).not.toBeVisible();
});
