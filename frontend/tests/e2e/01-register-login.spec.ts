/**
 * Flow 1: Register → Login → Dashboard
 * Risk: auth cookies not set correctly → user stuck on login page instead of dashboard.
 * This is the one test that uses the UI for registration, because the risk is the
 * register form flow itself. Subsequent tests authenticate via API.
 */
import { test, expect } from '@playwright/test';

test('register via UI then see empty dashboard', async ({ page }) => {
  const email = `e2e-reg-${Date.now()}@test.com`;
  const password = 'testpass123'; // pragma: allowlist secret

  // Step: navigate to register page
  await page.goto('/register');

  // Step: fill registration form
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);

  // Step: submit
  await page.getByRole('button', { name: 'Create account' }).click();

  // Assert: redirected to dashboard (auth cookies were set)
  await page.waitForURL('**/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);

  // Assert: no bills on a fresh account — empty state message visible
  await page.goto('/dashboard/bills');
  await expect(page.getByText('No bills yet')).toBeVisible();
});
