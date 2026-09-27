/**
 * Flow 24: Category multi-select filter is operable with the keyboard
 * Risk: the popup is portaled to document.body, which breaks the natural Tab
 *       order between its trigger and its checkboxes — arrow keys must be the
 *       primary way to move focus between options, same as the single-select
 *       Dropdown (flow 23). If they don't, the widget is mouse-only despite
 *       looking identical to the keyboard-operable one.
 * Real boundaries: auth, GET /bills, GET /bills/payments, the payments page's
 * category filter (2 categories: default "utilities" + one custom).
 */
import { test, expect } from '@playwright/test';
import { API, categoryIdByName, createBillViaApi, getCsrfHeader, loginNewUser, syncPaymentsViaApi } from './helpers';

test('category filter checkboxes are navigable with arrow keys, Home and End', async ({ page }) => {
  const stamp = Date.now();
  const customCategory = `E2E Kbd Cat ${stamp}`;

  await loginNewUser(page);
  const res = await page.request.post(`${API}/categories`, {
    data: { name: customCategory, color: 'rose' },
    headers: { 'Content-Type': 'application/json', ...(await getCsrfHeader(page)) },
  });
  expect(res.ok()).toBeTruthy();
  const customId = await categoryIdByName(page, customCategory);

  await createBillViaApi(page, `E2E Kbd Default Bill ${stamp}`); // utilities
  await createBillViaApi(page, `E2E Kbd Custom Bill ${stamp}`, customId);
  await syncPaymentsViaApi(page);

  await page.goto('/dashboard/payments');
  await page.getByRole('button', { name: 'All categories' }).click();

  const checkboxes = page.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(2);
  const first = checkboxes.nth(0);
  const second = checkboxes.nth(1);

  // Opening focuses the first checkbox in the list.
  await expect(first).toBeFocused();

  // ArrowDown moves to the next checkbox, and wraps back around.
  await page.keyboard.press('ArrowDown');
  await expect(second).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(first).toBeFocused();

  // ArrowUp from the first checkbox wraps to the last.
  await page.keyboard.press('ArrowUp');
  await expect(second).toBeFocused();

  // Home jumps to the first, End to the last.
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await page.keyboard.press('End');
  await expect(second).toBeFocused();

  // Space toggles the focused checkbox without losing focus or closing the popup.
  await expect(second).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(second).toBeChecked();
  await expect(second).toBeFocused();
});
