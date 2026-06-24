import type { Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:8010';

/**
 * Registers a fresh user via the backend API and returns their credentials.
 * Because page.request shares the browser context's cookie jar, the
 * access_token and auth_logged_in cookies set by the register endpoint are
 * immediately available to the page — no UI login required.
 */
export async function loginNewUser(page: Page): Promise<{ email: string; password: string }> {
  const email = `e2e-${Date.now()}@test.com`;
  const password = 'testpass123'; // pragma: allowlist secret

  const res = await page.request.post(`${API}/auth/register`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok()) {
    throw new Error(`Registration failed: ${res.status()} — ${await res.text()}`);
  }

  return { email, password };
}

/**
 * Creates a bill via the backend API. Requires an authenticated page context
 * (call loginNewUser first).
 */
export async function createBillViaApi(page: Page, name: string): Promise<number> {
  const res = await page.request.post(`${API}/bills`, {
    data: {
      name,
      category: 'utilities',
      frequency: 'monthly',
      amount: '99.99',
      currency: 'PLN',
      due_day: 15,
      is_paused: false,
    },
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok()) {
    throw new Error(`Create bill failed: ${res.status()} — ${await res.text()}`);
  }

  const bill = await res.json();
  return bill.id as number;
}

/**
 * Syncs payment instances for the current month via API, so rows appear on
 * the payments page without needing a UI interaction.
 */
export async function syncPaymentsViaApi(page: Page): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await page.request.post(`${API}/bills/sync-instances?month=${month}`);
}
