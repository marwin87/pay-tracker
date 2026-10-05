/**
 * Flow 3: Mark a payment paid → status changes
 * Risk: optimistic UI update not reflected — "Mark as Paid" stays after payment
 *       is recorded, or "Revert payment" never appears.
 * Real boundaries: auth, POST /bills/payments/:id/pay, UI state re-render.
 * Each test uses a fresh isolated user → exactly one payment row on the page.
 */
import { test, expect } from '@playwright/test';
import { API, getCsrfHeader, loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('marking a payment paid replaces Mark as Paid with Revert payment', async ({ page }) => {
  const billName = `E2E Paid ${Date.now()}`;

  // Setup: authenticate + create bill + sync instances via API
  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  // Step: navigate to payments page
  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();

  // Step: click "Mark as Paid" (only one row → no ambiguity)
  await page.getByRole('button', { name: 'Mark as Paid' }).click();

  // MarkPaidDialog appears — confirm
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Mark as Paid' }).click();

  // Assert: the user is told the payment was marked as paid
  await expect(page.getByRole('status')).toContainText(`“${billName}” marked as paid`);

  // Assert: "Revert payment" button appears (status changed to paid)
  await expect(page.getByLabel('Revert payment')).toBeVisible();

  // Assert: "Mark as Paid" button is gone
  await expect(page.getByRole('button', { name: 'Mark as Paid' })).not.toBeVisible();
});

test('paying a payment that another tab already paid shows a clear message', async ({ page }) => {
  const billName = `E2E Stale Paid ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  // The page loads with the payment still unpaid...
  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName, { exact: true })).toBeVisible();

  // ...then it gets paid elsewhere (another tab/device), so this page is now stale.
  const month = new Date().toISOString().slice(0, 7);
  const payments = await (await page.request.get(`${API}/bills/payments?month=${month}`)).json();
  const paid = await page.request.post(`${API}/bills/payments/${payments[0].id}/pay`, {
    data: {},
    headers: await getCsrfHeader(page),
  });
  expect(paid.ok()).toBe(true);

  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Mark as Paid' }).click();

  // Localized message instead of the raw API error
  await expect(dialog.getByText('This payment is already marked as paid.')).toBeVisible();
});
