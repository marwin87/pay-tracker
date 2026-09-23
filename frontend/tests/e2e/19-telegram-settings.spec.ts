/**
 * Flow 19: Telegram notification settings
 * Risk: Telegram shares (or overwrites) the email schedule instead of having its own,
 *       the setup help is not collapsed by default, or the saved bot token leaks
 *       back to the browser / send buttons work before credentials exist.
 * Real boundaries: auth, Settings page, PATCH /auth/me, DB. Telegram itself is never called.
 * Each test uses a fresh isolated user.
 */
import { test, expect } from '@playwright/test';
import { API, loginNewUser } from './helpers';

const BOT_TOKEN = '123456789:AAF3kxyz_-abcdefghij';

async function openNotifications(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/settings?tab=notifications');
  await expect(page.getByRole('heading', { name: 'Telegram Notifications' })).toBeVisible();
}

test('setup help is collapsed by default and explains the getUpdates method', async ({ page }) => {
  await loginNewUser(page);
  await openNotifications(page);

  // Assert: steps hidden until the user asks for them
  const url = page.getByText('https://api.telegram.org/bot', { exact: false });
  await expect(url).toBeHidden();

  // Step: expand
  await page.getByText('How do I get the bot token and chat ID?').click();
  await expect(url).toBeVisible();
  await expect(page.getByText('@BotFather', { exact: false })).toBeVisible();
});

test('Telegram schedule is independent from the email schedule', async ({ page }) => {
  await loginNewUser(page);
  await openNotifications(page);

  // Step: notifications are off and the schedule is locked until credentials
  // are saved, so save those and enable Telegram first
  await page.getByLabel('Bot token').fill(BOT_TOKEN);
  await page.getByLabel('Telegram chat ID').fill('123456789');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Token saved. Enter a new one to replace it.')).toBeVisible();

  // Step: enable "On the payment date" for Telegram only (2nd tile) and save
  await page.getByText('Enable Telegram notifications').click();
  await page.getByText('On the payment date').nth(1).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeHidden();

  // Assert: persisted for Telegram, email schedule untouched
  await page.reload();
  await expect(page.getByLabel('On the payment date').nth(1)).toBeChecked();
  await expect(page.getByLabel('On the payment date').nth(0)).not.toBeChecked();
});

test('bot token is write-only and send buttons need saved credentials', async ({ page }) => {
  await loginNewUser(page);
  await openNotifications(page);

  // Assert: nothing to send to yet
  await expect(page.getByText('Save the bot token and chat ID above to enable sending.')).toBeVisible();

  // Step: save both credentials
  await page.getByLabel('Bot token').fill(BOT_TOKEN);
  await page.getByLabel('Telegram chat ID').fill('123456789');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Assert: token is not shown back; send actions unlocked
  await expect(page.getByText('Token saved. Enter a new one to replace it.')).toBeVisible();
  await expect(page.getByLabel('Bot token')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Send test message' })).toBeEnabled();
  await expect(page.getByText('Save the bot token and chat ID above to enable sending.')).toBeHidden();

  // Assert: the API never returns the token
  const me = await page.request.get(`${API}/auth/me`);
  expect(me.ok()).toBeTruthy();
  const text = await me.text();
  expect(text).not.toContain(BOT_TOKEN);
  expect(JSON.parse(text).telegram_bot_token_set).toBe(true);
});
