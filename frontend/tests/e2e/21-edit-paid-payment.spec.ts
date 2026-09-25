/**
 * Flow 21: Edit a paid payment (amount + note) without reverting it
 * Risk: the edit dialog closes but the change is not saved (or the payment silently
 *       becomes unpaid / a duplicate next-period row appears), so the user sees wrong data.
 * Real boundaries: auth, POST /bills/payments/:id/pay + PATCH /bills/payments/:id, UI state, reload.
 * Each test uses a fresh isolated user → exactly one payment row on the page.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('editing a paid payment keeps it paid, saves new amount and note, survives reload', async ({ page }) => {
  const billName = `E2E EditPaid ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName)).toBeVisible();

  // Step: pay it with an initial amount and note
  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount paid').fill('100');
  await dialog.getByLabel('Notes (optional)').fill('first note');
  await dialog.getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(page.getByText('first note')).toBeVisible();

  // Step: edit it — dialog is prefilled with what was recorded
  await page.getByLabel('Edit payment').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Amount paid')).toHaveValue('100.00');
  await expect(dialog.getByLabel('Notes (optional)')).toHaveValue('first note');
  await dialog.getByLabel('Amount paid').fill('87.50');
  await dialog.getByLabel('Notes (optional)').fill('second note');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  // Assert: still paid, with the new values
  await expect(page.getByText(/Paid on/)).toContainText('87.50');
  await expect(page.getByText('second note')).toBeVisible();
  await expect(page.getByText('first note')).not.toBeVisible();

  // Assert: the server agrees, and the note can be cleared
  await page.reload();
  await expect(page.getByText(/Paid on/)).toContainText('87.50');
  await expect(page.getByText('second note')).toBeVisible();

  await page.getByLabel('Edit payment').click();
  await dialog.getByLabel('Notes (optional)').fill('');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByText(/Paid on/)).toBeVisible();
  await expect(page.getByText('second note')).not.toBeVisible();
});
