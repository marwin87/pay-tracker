/**
 * Flow 23: Dropdown listbox is operable with the keyboard
 * Risk: ArrowDown/ArrowUp/Home/End don't move focus (or the modulo wraparound
 *       math is off-by-one), leaving the listbox mouse-only despite its
 *       role="listbox"/role="option" ARIA markup promising keyboard support.
 * Real boundaries: auth, GET /bills, the bills page's "Sort by" filter
 * (2 options: Category A-Z / Category Z-A — enough to prove wraparound).
 */
import { test, expect } from '@playwright/test';
import { loginNewUser, createBillViaApi } from './helpers';

test('Sort by dropdown listbox is navigable with arrow keys, Home and End', async ({ page }) => {
  await loginNewUser(page);
  await createBillViaApi(page, `E2E Dropdown ${Date.now()}`);

  await page.goto('/dashboard/bills');

  const trigger = page.getByRole('button', { name: 'Sort by' });
  await trigger.click();

  const ascOption = page.getByRole('option', { name: 'Category A-Z' });
  const descOption = page.getByRole('option', { name: 'Category Z-A' });

  // Opening focuses the first option (no selection is active yet: default sort
  // isn't one of these two, so selectedIndex is -1 → falls back to index 0).
  await expect(ascOption).toBeFocused();

  // ArrowDown moves to the next option.
  await page.keyboard.press('ArrowDown');
  await expect(descOption).toBeFocused();

  // ArrowDown again wraps back around to the first option.
  await page.keyboard.press('ArrowDown');
  await expect(ascOption).toBeFocused();

  // ArrowUp from the first option wraps to the last.
  await page.keyboard.press('ArrowUp');
  await expect(descOption).toBeFocused();

  // Home jumps to the first option, End to the last.
  await page.keyboard.press('Home');
  await expect(ascOption).toBeFocused();
  await page.keyboard.press('End');
  await expect(descOption).toBeFocused();

  // Enter activates the focused option like a click would.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).not.toBeVisible();
  await expect(trigger).toHaveText('Category Z-A');
});
