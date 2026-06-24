/**
 * Flow 5: Archive a bill → moves to archived page
 * Risk: bill remains on the active list after archiving, or does not appear on
 *       the archived list — user thinks the bill was deleted.
 * Real boundaries: auth, PATCH /bills/:id (is_archived=true), bills list pages.
 * Each test uses a fresh isolated user → exactly one bill on the active list.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi } from './helpers';

test('archived bill leaves active list and appears on archived page', async ({ page }) => {
  const billName = `E2E Archive ${Date.now()}`;

  // Setup: authenticate + create bill via API
  await loginNewUser(page);
  await createBillViaApi(page, billName);

  // Step: navigate to bills page
  await page.goto('/dashboard/bills');
  await expect(page.getByText(billName)).toBeVisible();

  // Step: hover over the bill row to reveal the action buttons
  // (sm+ viewports show Edit/Archive on group-hover)
  await page.getByText(billName).hover();

  // Step: click "Archive" (aria-label on the archive button in BillTemplateRow)
  await page.getByRole('button', { name: 'Archive' }).click();

  // ArchiveConfirmDialog appears
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Step: confirm archive
  await dialog.getByRole('button', { name: 'Archive' }).click();

  // Assert: bill no longer on the active bills list
  // Wait for the dialog to close first, then check the list
  await expect(page.getByRole('dialog')).not.toBeVisible();
  // exact: true avoids strict-mode violation from the dialog title containing the bill name
  await expect(page.getByText(billName, { exact: true })).not.toBeVisible();

  // Step: navigate to the archived bills page
  await page.goto('/dashboard/bills/archived');

  // Assert: bill appears in the archived list
  await expect(page.getByText(billName)).toBeVisible();
});
