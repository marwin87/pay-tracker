/**
 * Flow 27: "Reset filters" clears every active filter and then disappears
 * Risk: the button misses one filter (search, category or the calendar day on
 *       Payments), so the list stays narrowed and the user thinks bills are
 *       missing; or it stays visible with nothing to reset.
 * Real boundaries: auth, GET /bills, GET /bills/payments, the Payments and Bills
 * pages' filter state (2 categories: default "utilities" + one custom).
 */
import { test, expect, type Page } from '@playwright/test';
import { API, categoryIdByName, createBillViaApi, getCsrfHeader, loginNewUser, syncPaymentsViaApi } from './helpers';

async function seedTwoCategories(page: Page) {
  const stamp = Date.now();
  const customCategory = `E2E Reset Cat ${stamp}`;
  const defaultBill = `E2E Reset Default ${stamp}`;
  const customBill = `E2E Reset Custom ${stamp}`;

  await loginNewUser(page);
  const res = await page.request.post(`${API}/categories`, {
    data: { name: customCategory, color: 'rose' },
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });
  expect(res.ok()).toBeTruthy();
  const customId = await categoryIdByName(page, customCategory);

  await createBillViaApi(page, defaultBill); // utilities
  await createBillViaApi(page, customBill, customId);
  await syncPaymentsViaApi(page);
  return { customCategory, defaultBill, customBill };
}

async function filterByCategory(page: Page, category: string) {
  await page.getByRole('button', { name: 'All categories' }).click();
  await page.getByRole('checkbox', { name: category }).check({ force: true });
  await page.keyboard.press('Escape');
}

test('Payments: reset clears search, category and the calendar day', async ({ page }) => {
  const { customCategory, defaultBill, customBill } = await seedTwoCategories(page);
  const reset = page.getByRole('button', { name: /Reset filters/ });
  const search = page.getByRole('searchbox', { name: 'Search by name…' });

  await page.goto('/dashboard/payments');
  await expect(page.getByText(defaultBill, { exact: true })).toBeVisible();
  await expect(page.getByText(customBill, { exact: true })).toBeVisible();
  await expect(reset).toHaveCount(0);

  // Search narrows the list and reveals the button with a count of 1.
  await search.fill('Default');
  await expect(page.getByText(customBill, { exact: true })).toBeHidden();
  await expect(reset).toContainText('1');

  // Category + calendar day on top of the search: 3 active filters.
  await search.fill('');
  await filterByCategory(page, customCategory);
  await expect(page.getByText(defaultBill, { exact: true })).toBeHidden();
  const calendarToggle = page.getByRole('button', { name: 'Calendar' });
  if ((await calendarToggle.getAttribute('aria-expanded')) !== 'true') await calendarToggle.click();
  await page.getByRole('button', { name: '15', exact: true }).click();
  await expect(page.getByText(/^Payments for /)).toBeVisible();
  await search.fill('Custom');
  await expect(reset).toContainText('3');

  // One click puts everything back.
  await reset.click();
  await expect(search).toHaveValue('');
  await expect(page.getByText(/^Payments for /)).toBeHidden();
  await expect(page.getByText(defaultBill, { exact: true })).toBeVisible();
  await expect(page.getByText(customBill, { exact: true })).toBeVisible();
  await expect(reset).toHaveCount(0);
});

test('Bills: reset clears search and category', async ({ page }) => {
  const { customCategory, defaultBill, customBill } = await seedTwoCategories(page);
  const reset = page.getByRole('button', { name: /Reset filters/ });
  const search = page.getByRole('searchbox', { name: 'Search by name…' });

  await page.goto('/dashboard/bills');
  await expect(page.getByText(defaultBill, { exact: true })).toBeVisible();
  await expect(reset).toHaveCount(0);

  await search.fill('Custom');
  await filterByCategory(page, customCategory);
  await expect(page.getByText(defaultBill, { exact: true })).toBeHidden();
  await expect(reset).toContainText('2');

  await reset.click();
  await expect(search).toHaveValue('');
  await expect(page.getByText(defaultBill, { exact: true })).toBeVisible();
  await expect(page.getByText(customBill, { exact: true })).toBeVisible();
  await expect(reset).toHaveCount(0);
});
