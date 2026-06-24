/**
 * Flow 6: Export → Restore → data intact
 * Risk: restore wipes data or corrupts bill count — user loses history.
 * Real boundaries: auth, GET /export/json, POST /export/restore, DB round-trip.
 * Export is done via API (to avoid file-system download handling); restore uses
 * the RestoreButton UI to test the real upload-confirm flow.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi } from './helpers';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test('restore from backup preserves bill count', async ({ page }) => {
  const billName = `E2E Export ${Date.now()}`;

  // Setup: authenticate + create a bill via API
  await loginNewUser(page);
  await createBillViaApi(page, billName);

  // Step: export backup JSON via API (bypass the browser download to avoid temp-file
  // download complexity; the restore UI is the boundary under test here)
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8010';
  const exportRes = await page.request.get(`${apiUrl}/export/json`);
  expect(exportRes.ok()).toBeTruthy();
  const backup = await exportRes.json();
  const billCountBefore: number = backup.bill_templates.length;
  expect(billCountBefore).toBeGreaterThan(0);

  // Save backup to a temp file so the file chooser can pick it up
  const tmpFile = path.join(os.tmpdir(), `pay-tracker-backup-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(backup));

  // Step: navigate to settings where RestoreButton lives
  await page.goto('/dashboard/settings');
  await expect(page.getByRole('button', { name: 'Restore from backup' })).toBeVisible();

  // Step: click restore button — triggers hidden file input
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Restore from backup' }).click(),
  ]);
  await fileChooser.setFiles(tmpFile);

  // Confirmation dialog appears
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Step: confirm "Replace My Data"
  await dialog.getByRole('button', { name: 'Replace My Data' }).click();

  // RestoreButton reloads the page on success — wait for navigation
  await page.waitForURL('**/settings');

  // Step: re-export to verify count matches
  const afterRes = await page.request.get(`${apiUrl}/export/json`);
  const after = await afterRes.json();
  const billCountAfter: number = after.bill_templates.length;

  // Assert: bill count is identical after restore
  expect(billCountAfter).toBe(billCountBefore);

  // Assert: the specific bill is still there
  const names = after.bill_templates.map((t: { name: string }) => t.name);
  expect(names).toContain(billName);

  // Cleanup temp file
  fs.unlinkSync(tmpFile);
});
