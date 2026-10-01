import { execSync } from 'child_process';

// The e2e suite registers dozens of users from one IP, which the auth rate limiter
// (RATE_LIMIT_ENABLED) would block with 429. Hard-coded off for e2e only — it must not
// depend on .env. Compose sets container env at creation, so a backend that is already
// running keeps its old value (and Playwright's webServer reuses a running stack
// without starting anything); `up` recreates the backend only when the value differs.
// CI starts its stack with the flag already off, so nothing to do there.
export default async function globalSetup(): Promise<void> {
  if (process.env.CI) return;
  execSync('docker compose up -d --wait backend', {
    stdio: 'inherit',
    env: { ...process.env, RATE_LIMIT_ENABLED: 'false' },
  });
}
