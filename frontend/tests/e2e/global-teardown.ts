import * as fs from 'fs';

const API = process.env.E2E_API_URL ?? 'http://localhost:8010';
const E2E_USERS_FILE = '/tmp/e2e-users.json';

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(E2E_USERS_FILE)) return;

  const users = JSON.parse(
    fs.readFileSync(E2E_USERS_FILE, 'utf-8'),
  ) as Array<{ email: string; token: string }>;

  for (const { email, token } of users) {
    try {
      const res = await fetch(`${API}/auth/users/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 404) {
        console.warn(`[teardown] Failed to delete ${email}: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[teardown] Error deleting ${email}:`, err);
    }
  }

  fs.unlinkSync(E2E_USERS_FILE);
}
