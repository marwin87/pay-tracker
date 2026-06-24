/**
 * seed.spec.ts — exemplar for generated E2E tests.
 * Risk: bill creation is not persisted → dashboard stays empty.
 * Demonstrates: role-based locators, isolated auth via API, wait-for-state.
 * See e2e-rules.md for the full rule set.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi } from './helpers';

test('created bill persists after page reload', async ({ page }) => {
  const billName = `Seed Bill ${Date.now()}`;

  // Setup: authenticate without using the login UI
  await loginNewUser(page);

  // Create bill via API so setup is fast and deterministic
  await createBillViaApi(page, billName);

  // Navigate to the bills list
  await page.goto('/dashboard/bills');

  // Assert bill is visible
  await expect(page.getByText(billName)).toBeVisible();

  // Reload and verify persistence (SSR + client fetch round-trip)
  await page.reload();
  await expect(page.getByText(billName)).toBeVisible();
});
