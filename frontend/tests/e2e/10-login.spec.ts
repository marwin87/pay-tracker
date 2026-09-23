/**
 * Flow 10: Log in as an existing user — wrong credentials, then correct ones
 * Risk: the login form accepts bad credentials or hides the failure (user thinks
 *       they are logged in), or valid credentials do not land on the dashboard.
 * Real boundaries: auth (POST /auth/login), cookies, routing.
 * The user is created via API, then cookies are cleared so the login form is
 * reached unauthenticated (proxy.ts redirects logged-in users away from /login).
 */
import { test, expect } from '@playwright/test';
import { loginNewUser } from './helpers';

test('wrong password shows an error, correct credentials reach the dashboard', async ({ page }) => {
  const { email, password } = await loginNewUser(page);
  await page.context().clearCookies();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('definitely-wrong-password'); // pragma: allowlist secret
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Assert: failure is surfaced and the user stays on the login page
  await expect(page.getByText('Login failed')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // Step: retry with the right password
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Assert: authenticated and redirected
  await page.waitForURL('**/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('unknown email cannot log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(`nobody-${Date.now()}@test.com`);
  await page.getByLabel('Password').fill('testpass123'); // pragma: allowlist secret
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Login failed')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
