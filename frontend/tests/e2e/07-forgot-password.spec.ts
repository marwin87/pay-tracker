/**
 * Flow 7: Forgot password → reset password flow
 * Risk: the reset form submits but does not redirect to login, or the password
 *       is not actually updated — user is locked out.
 *
 * Real boundaries: auth, browser routing, form submission.
 * Mocked boundaries: POST /auth/forgot-password and POST /auth/reset-password
 *   are mocked at the network layer — SMTP is unavailable in the test environment
 *   so the real email token cannot be retrieved; backend unit tests
 *   (test_auth_endpoints.py) cover actual token verification and password update.
 *
 * What this test protects:
 *   - forgot-password form renders for unauthenticated users
 *   - submitting the form shows the success confirmation message
 *   - reset-password form renders when reached with a token in the URL
 *   - submitting the reset form redirects to /login on success
 */
import { test, expect } from '@playwright/test';

test('forgot-password form shows success message and reset form redirects to login', async ({ page }) => {
  // Mock: POST /auth/forgot-password → always return 200 so the success
  // message is shown without real SMTP/email delivery
  await page.route('**/auth/forgot-password', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'If that email is registered, you\'ll receive a reset link shortly.' }),
    });
  });

  // Mock: POST /auth/reset-password → 200 OK so the form redirect can be exercised
  await page.route('**/auth/reset-password', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Password reset successful' }),
    });
  });

  // ── Part A: forgot-password form ──────────────────────────────────────────

  // Step: navigate to the forgot-password page (no auth cookies — fresh browser context)
  await page.goto('/forgot-password');
  await expect(page.getByLabel('Email')).toBeVisible();

  // Step: submit the email
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  // Assert: success confirmation text replaces the form
  await expect(
    page.getByText("If that email is registered, you'll receive a reset link shortly.")
  ).toBeVisible();

  // ── Part B: reset-password form ───────────────────────────────────────────

  // Step: navigate to the reset-password page with a fake token in the URL
  await page.goto('/reset-password?token=e2e-fake-token');
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();

  // Step: fill and submit the reset form
  // exact: true needed — getByLabel('New password') partially matches 'Confirm new password'
  await page.getByLabel('New password', { exact: true }).fill('newpassword99');
  await page.getByLabel('Confirm new password', { exact: true }).fill('newpassword99');
  await page.getByRole('button', { name: 'Set new password' }).click();

  // Assert: redirected to login page after successful reset
  await page.waitForURL('**/login');
  await expect(page).toHaveURL(/\/login/);
});
