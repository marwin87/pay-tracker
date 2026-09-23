/**
 * Flow 18: Settings tab organization
 * Risk: settings land under the wrong tab (currency/language hidden under Account),
 *       the active tab is lost on refresh / deep-link, or the tab bar is not exposed
 *       as tabs to assistive tech.
 * Real boundaries: auth, Settings page, URL (?tab=).
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { loginNewUser } from './helpers';

test('settings has five tabs; Currency and Languages live under Preferences, not Account', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings');

  // Assert: five tabs exposed with the tab role
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveText(['Account', 'Preferences', 'Notifications', 'Categories', 'Data']);
  await expect(page.getByRole('tab', { name: 'Account', exact: true })).toHaveAttribute('aria-selected', 'true');

  // Assert: Account holds identity tiles, not preferences
  await expect(page.getByRole('heading', { name: 'User Profile' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Password' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delete Account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Default Currency' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Languages' })).toBeHidden();

  // Step: open Preferences
  await page.getByRole('tab', { name: 'Preferences', exact: true }).click();

  // Assert: Preferences holds Currency + Languages, Account tiles are hidden
  await expect(page.getByRole('heading', { name: 'Default Currency' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Languages' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'User Profile' })).toBeHidden();
});

test('active settings tab is kept in the URL: refresh and deep-link land on it', async ({ page }) => {
  await loginNewUser(page);
  await page.goto('/dashboard/settings');

  // Step: switch tab
  await page.getByRole('tab', { name: 'Notifications', exact: true }).click();
  await expect(page).toHaveURL(/[?&]tab=notifications/);

  // Assert: survives a refresh
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Notifications', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Email Notifications' })).toBeVisible();

  // Assert: a deep-link opens the requested tab; an unknown value falls back to Account
  await page.goto('/dashboard/settings?tab=data');
  await expect(page.getByRole('tab', { name: 'Data', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Backup Data' })).toBeVisible();

  await page.goto('/dashboard/settings?tab=bogus');
  await expect(page.getByRole('tab', { name: 'Account', exact: true })).toHaveAttribute('aria-selected', 'true');
});
