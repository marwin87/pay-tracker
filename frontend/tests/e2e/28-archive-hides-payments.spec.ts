/**
 * Flow 28: Pausing a bill removes its unpaid payments from Payments; resuming brings them back
 * Risk: the user cancels a subscription (pauses the bill) but its unpaid payment
 *       keeps showing under Payments, so pausing looks broken — or resuming the
 *       bill leaves Payments empty.
 * Real boundaries: auth, POST /bills/:id/archive + /unarchive, GET /bills/payments,
 * POST /bills/sync-instances, the Bills and Payments pages.
 */
import { test, expect } from '@playwright/test';
import { createBillViaApi, loginNewUser, syncPaymentsViaApi } from './helpers';

test('paused bill disappears from Payments and comes back when resumed', async ({ page }) => {
  const billName = `E2E Netflix ${Date.now()}`;
  const row = page.getByText(billName, { exact: true });

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  // The unpaid payment for this month is listed.
  await page.goto('/dashboard/payments');
  await expect(row).toBeVisible();

  // Pause the bill from the Bills page.
  await page.goto('/dashboard/bills');
  await row.hover();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('status')).toContainText('paused');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // Its payment is gone from Payments.
  const paymentsLoaded = page.waitForResponse(
    (r) => r.url().includes('/bills/payments') && r.request().method() === 'GET',
  );
  await page.goto('/dashboard/payments');
  await paymentsLoaded;
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(row).toHaveCount(0);

  // Resume it from the Bills page.
  await page.goto('/dashboard/bills');
  await page.getByRole('button', { name: /Show paused/ }).first().click();
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // The payment is back on Payments.
  await page.goto('/dashboard/payments');
  await expect(row).toBeVisible();
});
