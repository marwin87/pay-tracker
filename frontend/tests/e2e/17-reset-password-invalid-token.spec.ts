/**
 * Flow 17: Reset password with an invalid / expired token
 * Risk: a bad token silently "succeeds" and redirects to login (user thinks the
 *       password changed), or shows no way forward.
 * Real boundaries: auth, browser routing, POST /auth/reset-password — NOT mocked;
 *   the real backend rejects an unknown token, which is indistinguishable from an
 *   expired one (both are "no matching, unexpired token row").
 */
import { test, expect } from '@playwright/test';

test('invalid reset token shows an expired-link message and a way to request a new one', async ({ page }) => {
  await page.goto('/reset-password?token=this-token-does-not-exist');

  await page.getByLabel('New password', { exact: true }).fill('newpassword99'); // pragma: allowlist secret
  await page.getByLabel('Confirm new password', { exact: true }).fill('newpassword99'); // pragma: allowlist secret
  await page.getByRole('button', { name: 'Set new password' }).click();

  // Assert: failure is surfaced, user is NOT sent to /login
  await expect(page.getByText('This link has expired or is invalid.')).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password/);

  // Assert: recovery path is offered and works
  await page.getByRole('link', { name: 'Request a new link' }).click();
  await page.waitForURL('**/forgot-password');
});

test('mismatched passwords are rejected before hitting the backend', async ({ page }) => {
  await page.goto('/reset-password?token=irrelevant');

  await page.getByLabel('New password', { exact: true }).fill('newpassword99'); // pragma: allowlist secret
  await page.getByLabel('Confirm new password', { exact: true }).fill('different-password'); // pragma: allowlist secret
  await page.getByRole('button', { name: 'Set new password' }).click();

  await expect(page.getByText(/do not match|don't match/i)).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password/);
});
