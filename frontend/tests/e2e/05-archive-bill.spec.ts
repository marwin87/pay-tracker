/**
 * Flow 5: Pause a bill → leaves the bills list, shows under "Show paused"; resuming brings it back
 * Risk: bill remains on the list after pausing, or cannot be found among paused bills —
 *       user thinks the bill was deleted. Or: resume does nothing and a paused bill can
 *       never come back.
 * Real boundaries: auth, POST /bills/:id/archive + /unarchive, bills list page.
 * Each test uses a fresh isolated user → exactly one bill on the list.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi } from './helpers';

test('paused bill leaves the list, shows with "Show paused", and resumes', async ({ page }) => {
  const billName = `E2E Pause ${Date.now()}`;
  const row = page.getByText(billName, { exact: true });

  await loginNewUser(page);
  await createBillViaApi(page, billName);

  await page.goto('/dashboard/bills');
  await expect(row).toBeVisible();

  // Pause (sm+ viewports show the buttons on group-hover)
  await row.hover();
  await page.getByRole('button', { name: 'Pause' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Pause' }).click();

  // The user is told the bill was paused, and it leaves the list
  await expect(page.getByRole('status')).toContainText(`“${billName}” paused`);
  await expect(dialog).not.toBeVisible();
  await expect(row).not.toBeVisible();

  // It reappears (marked Paused) when paused bills are shown
  await page.getByRole('button', { name: /Show paused/ }).first().click();
  await expect(row).toBeVisible();

  // Resume
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText(`“${billName}” resumed`);

  // Back as a normal bill on the list (no Resume button left)
  await page.goto('/dashboard/bills');
  await expect(row).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
});
