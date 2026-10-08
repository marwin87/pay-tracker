/**
 * Flow 28: Archiving a bill removes its unpaid payments from Payments; restoring brings them back
 * Risk: the user cancels a subscription (archives the bill) but its unpaid payment
 *       keeps showing under Payments, so archiving looks broken — or restoring the
 *       bill leaves Payments empty.
 * Real boundaries: auth, POST /bills/:id/archive + /unarchive, GET /bills/payments,
 * POST /bills/sync-instances, the Bills, Archive and Payments pages.
 */
import { test, expect } from '@playwright/test';
import { createBillViaApi, loginNewUser, syncPaymentsViaApi } from './helpers';

test('archived bill disappears from Payments and comes back when restored', async ({ page }) => {
  const billName = `E2E Netflix ${Date.now()}`;
  const row = page.getByText(billName, { exact: true });

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  // The unpaid payment for this month is listed.
  await page.goto('/dashboard/payments');
  await expect(row).toBeVisible();

  // Archive the bill from the Bills page.
  await page.goto('/dashboard/bills');
  await row.hover();
  await page.getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('status')).toContainText('archived');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // Its payment is gone from Payments.
  const paymentsLoaded = page.waitForResponse(
    (r) => r.url().includes('/bills/payments') && r.request().method() === 'GET',
  );
  await page.goto('/dashboard/payments');
  await paymentsLoaded;
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(row).toHaveCount(0);

  // Restore it from the archive.
  await page.goto('/dashboard/bills/archived');
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // The payment is back on Payments.
  await page.goto('/dashboard/payments');
  await expect(row).toBeVisible();
});
