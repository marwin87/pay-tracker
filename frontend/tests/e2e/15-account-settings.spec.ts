/**
 * Flow 15: Change email and password from Settings → Account
 * Risk: the form reports nothing/success but the credential is not actually changed
 *       (user locked out or still on the old password), or a wrong current password
 *       is accepted.
 * Real boundaries: auth, PATCH /auth/change-email + /auth/change-password, login API.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { API, getCsrfHeader, loginNewUser } from './helpers';

test('changing email updates the account; wrong current password is rejected', async ({ page }) => {
  const { email } = await loginNewUser(page);
  const newEmail = `e2e-changed-${Date.now()}@test.com`;

  await page.goto('/dashboard/settings');
  await expect(page.getByText(email)).toBeVisible();

  // Step: wrong current password
  await page.getByPlaceholder('new@email.com').fill(newEmail);
  await page.getByPlaceholder('Enter current password').first().fill('not-my-password'); // pragma: allowlist secret
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Assert: rejected, email unchanged
  await expect(page.getByText('Current password is incorrect.')).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // Step: correct current password
  await page.getByPlaceholder('Enter current password').first().fill('testpass123'); // pragma: allowlist secret
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Assert: profile now shows the new email, and it persists across reload
  await expect(page.getByText(newEmail)).toBeVisible();
  await page.reload();
  await expect(page.getByText(newEmail)).toBeVisible();
});

test('changing password: new one logs in, old one no longer does', async ({ page }) => {
  const { email, password } = await loginNewUser(page);
  const newPassword = 'brandnewpass456'; // pragma: allowlist secret

  await page.goto('/dashboard/settings');

  // Step: too-short new password is rejected client-side
  await page.getByPlaceholder('Enter current password').last().fill(password);
  await page.getByPlaceholder('New password (min. 8 characters)').fill('short');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();

  // Step: wrong current password is rejected and does NOT log the user out
  await page.getByPlaceholder('Enter current password').last().fill('not-my-password'); // pragma: allowlist secret
  await page.getByPlaceholder('New password (min. 8 characters)').fill(newPassword);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Current password is incorrect.')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/settings/);

  // Step: valid change
  await page.getByPlaceholder('Enter current password').last().fill(password);
  const changed = page.waitForResponse((r) => r.url().includes('/auth/change-password') && r.ok());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await changed;

  // Assert: form resets (no leftover Save button)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).not.toBeVisible();

  // Assert: backend accepts the new password and rejects the old one
  const withNew = await page.request.post(`${API}/auth/login`, {
    data: { email, password: newPassword },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(withNew.ok()).toBeTruthy();
  const withOld = await page.request.post(`${API}/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(withOld.status()).toBe(401);

  // Cleanup: the password change invalidated the token globalTeardown holds, so
  // delete this user with the fresh session cookies from the new-password login.
  const cleanup = await page.request.delete(`${API}/auth/users/me`, {
    headers: await getCsrfHeader(page),
  });
  expect(cleanup.ok()).toBeTruthy();
});
