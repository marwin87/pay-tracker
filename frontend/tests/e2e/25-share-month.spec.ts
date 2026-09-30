/**
 * Flow 25: Share the month summary by email
 * Risk: the share button shows without SMTP/opt-in, or Send posts the wrong
 *       month/address, so summaries go nowhere or to the wrong person.
 * Real boundaries: auth, PATCH /auth/me. SMTP is mocked (no mail server in e2e).
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, getCsrfHeader, API } from './helpers';

async function enableShare(page: import('@playwright/test').Page) {
  const res = await page.request.patch(`${API}/auth/me`, {
    data: { share_enabled: true },
    headers: await getCsrfHeader(page),
  });
  expect(res.ok()).toBeTruthy();
}

test('Share > hidden until opted in, then sends the selected month to the typed address', async ({ page }) => {
  await page.route('**/auth/smtp-status', (r) => r.fulfill({ json: { configured: true } }));
  let posted: { email: string; month: string } | null = null;
  await page.route('**/auth/share-month', async (r) => {
    posted = r.request().postDataJSON();
    await r.fulfill({ json: { sent: true } });
  });

  await loginNewUser(page);
  await page.goto('/dashboard/payments');
  await expect(page.getByRole('button', { name: /Excel Export/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share by email' })).toHaveCount(0);

  await enableShare(page);
  await page.goto('/dashboard/payments');
  await page.getByRole('button', { name: 'Share by email' }).click();

  const dialog = page.getByRole('dialog');
  const send = dialog.getByRole('button', { name: 'Send', exact: true });
  await expect(send).toBeDisabled();
  await dialog.getByLabel('Email address').fill('friend@gmail.com');
  await send.click();

  await expect(page.getByText('Month summary sent')).toBeVisible();
  expect(posted).toMatchObject({ email: 'friend@gmail.com', month: /^\d{4}-\d{2}$/ });
});

test('Share > hidden when SMTP is not configured', async ({ page }) => {
  await page.route('**/auth/smtp-status', (r) => r.fulfill({ json: { configured: false } }));
  await loginNewUser(page);
  await enableShare(page);
  await page.goto('/dashboard/payments');
  await expect(page.getByRole('button', { name: /Excel Export/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share by email' })).toHaveCount(0);
});

test('Share > follows the year arrows: same month, new year', async ({ page }) => {
  await page.route('**/auth/smtp-status', (r) => r.fulfill({ json: { configured: true } }));
  let posted: { month: string } | null = null;
  await page.route('**/auth/share-month', async (r) => {
    posted = r.request().postDataJSON();
    await r.fulfill({ json: { sent: true } });
  });

  await loginNewUser(page);
  await enableShare(page);
  await page.goto('/dashboard/payments');

  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  const month = String(now.getMonth() + 1).padStart(2, '0');
  await page.getByRole('button', { name: 'Previous year' }).click();
  await expect(page.getByText(String(lastYear), { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Share by email' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(String(lastYear));
  await dialog.getByLabel('Email address').fill('friend@gmail.com');
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('Month summary sent')).toBeVisible();
  expect(posted).toMatchObject({ month: `${lastYear}-${month}` });
});
