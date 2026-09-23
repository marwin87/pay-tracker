/**
 * Flow 13: Excel export from the payments page
 * Risk: the export button does nothing or downloads an empty/corrupt file, so
 *       the user's yearly spreadsheet is silently missing.
 * Real boundaries: auth, GET /export/xlsx, browser download.
 */
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, syncPaymentsViaApi } from './helpers';

test('Excel Export downloads a non-empty .xlsx for the selected year', async ({ page }) => {
  const billName = `E2E Xlsx ${Date.now()}`;

  await loginNewUser(page);
  await createBillViaApi(page, billName);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await expect(page.getByText(billName)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Excel Export/ }).click();
  const download = await downloadPromise;

  // Assert: named for the selected year
  expect(download.suggestedFilename()).toMatch(new RegExp(`^pay-tracker-.+-${new Date().getFullYear()}\\.xlsx$`));

  // Assert: a real xlsx (zip container → "PK" magic bytes), not an empty or error body
  const filePath = await download.path();
  const bytes = fs.readFileSync(filePath);
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
});
