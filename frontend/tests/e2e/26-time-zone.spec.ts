/**
 * Flow 26: Per-user time zone
 * Risk: the account keeps the server default instead of the browser's zone, the zone
 *       can't be changed or doesn't persist, or the Notifications tab keeps labelling
 *       the send time as UTC.
 * Real boundaries: POST /auth/register (browser zone), PATCH /auth/me, Settings page.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { API, loginNewUser, trackUser } from './helpers';

test.describe('registered from a browser in Tokyo', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('sign-up stores the browser time zone on the account', async ({ page }) => {
    const email = `e2e-tz-${Date.now()}@test.com`;
    const password = 'testpass123'; // pragma: allowlist secret

    trackUser(email, password); // before the UI flow, so a failure can't leak the account
    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/dashboard');

    const me = await (await page.request.get(`${API}/auth/me`)).json();
    expect(me.timezone).toBe('Asia/Tokyo');
  });
});

test('changing the time zone persists and relabels the send time', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings?tab=preferences');

  // Step: the tile starts with the account's zone and offers the browser's
  const zone = page.getByLabel('Time zone', { exact: true });
  await expect(zone).toHaveValue(/.+/);

  // Step: pick another zone and save
  await zone.fill('Pacific/Auckland');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).not.toBeVisible();

  // Assert: persisted server-side
  const me = await (await page.request.get(`${API}/auth/me`)).json();
  expect(me.timezone).toBe('Pacific/Auckland');

  // Assert: survives a reload
  await page.reload();
  await expect(page.getByLabel('Time zone', { exact: true })).toHaveValue('Pacific/Auckland');

  // Assert: the Notifications tab states the send time and server note in that zone
  await page.getByRole('tab', { name: 'Notifications', exact: true }).click();
  await expect(page.getByText('Send time (Pacific/Auckland)').first()).toBeVisible();
  await expect(page.getByText('Notifications are sent in your time zone')).toContainText(
    'Pacific/Auckland',
  );
});

test('an unknown zone is rejected before saving', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings?tab=preferences');

  await page.getByLabel('Time zone', { exact: true }).fill('Mars/Olympus');
  // While searching the list just says nothing matches; the error shows once it closes
  await expect(page.getByText('No matching time zone')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Pick a time zone from the list.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('the zone list opens on click even with a zone filled in, narrows as you type, picks by click or Enter', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings?tab=preferences');

  // Step: clicking the field (it already holds a zone) shows the whole list, not one match
  const zone = page.getByLabel('Time zone', { exact: true });
  await zone.click();
  const list = page.getByRole('listbox');
  await expect(list).toBeVisible();
  expect(await list.getByRole('option').count()).toBeGreaterThan(100);

  // Step: typing narrows it ("new york" finds America/New_York)
  await zone.fill('new york');
  await expect(list.getByRole('option')).toHaveText(['America/New_York']);

  // Step: pick by click
  await list.getByRole('option', { name: 'America/New_York' }).click();
  await expect(zone).toHaveValue('America/New_York');
  await expect(list).toBeHidden();

  // Step: search and pick with the keyboard
  await zone.fill('tokyo');
  await zone.press('Enter');
  await expect(zone).toHaveValue('Asia/Tokyo');

  // Assert: the choice saves
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).not.toBeVisible();
  const me = await (await page.request.get(`${API}/auth/me`)).json();
  expect(me.timezone).toBe('Asia/Tokyo');
});
