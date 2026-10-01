/**
 * Flow 9: Delete account → all owned data cascades, email frees up
 * Risk: DELETE endpoint fails to cascade (owned bill/category rows survive
 *       and block re-registration), or the email stays "taken" after the
 *       account row is gone — user can never sign up again with that address.
 * Real boundaries: auth, DELETE /auth/users/me, Settings page, POST /auth/register.
 * Each test uses a fresh isolated user with real owned data before deleting.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi, trackUser, untrackUser } from './helpers';

const API = process.env.E2E_API_URL ?? 'http://localhost:8010';

test('deleting the account cascades owned data and frees the email for re-registration', async ({ page }) => {
  const billName = `E2E Delete Account ${Date.now()}`;

  // Setup: authenticate + create a bill (owned category + template) so
  // deletion has real data to cascade, not just an empty account.
  const { email, password } = await loginNewUser(page);
  await createBillViaApi(page, billName);

  // Step: navigate to Settings, land on the "account" tab (default),
  // find the red "Delete account" tile and click its button.
  await page.goto('/dashboard/settings');
  // exact: true avoids matching the tile's own header button, whose
  // accessible name absorbs the tile title + description text.
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();

  // DeleteAccountDialog appears — confirm
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The destructive button stays disabled until a password is typed
  const confirm = dialog.getByRole('button', { name: 'Delete account', exact: true });
  await expect(confirm).toBeDisabled();

  // Wrong password: rejected, the dialog stays open and the user stays logged in
  await dialog.getByPlaceholder('Enter your password').fill('not-my-password'); // pragma: allowlist secret
  await confirm.click();
  await expect(dialog.getByText('Current password is incorrect.')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/settings/);

  // Correct password deletes the account
  await dialog.getByPlaceholder('Enter your password').fill(password);
  await confirm.click();

  // Assert: redirected to /login (cookies cleared server-side, client re-synced)
  await page.waitForURL('**/login');
  // The account (and its registration-time token) is gone — stop tracking it
  // so globalTeardown doesn't redundantly retry the delete and log a 401.
  untrackUser(email);

  // Assert: the email is truly free — re-registering with the same
  // email/password succeeds, proving the account row (and its unique
  // email constraint) is gone, not just logged out.
  const res = await page.request.post(`${API}/auth/register`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBe(true);
  // This re-registration is a brand new account row under the same email —
  // track it too, or it leaks past the suite untouched by teardown.
  trackUser(email, password);
});
