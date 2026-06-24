# Reset Password — Plan Brief

> Full plan: `context/changes/reset-password/plan.md`
> Design spec: `context/changes/reset-password/change.md`

## What & Why

Pay Tracker has no way to recover a forgotten password. The design spec in `change.md` defines a standard email-token reset flow as a gap-fill. All required infrastructure (SMTP, JWT, bcrypt, multilingual email) already exists — this change wires them into two new API endpoints and two new frontend pages.

## Starting Point

The auth system supports register, login, logout, change-password, and change-email. There is no `password_reset_tokens` table, no reset endpoints, and no `APP_BASE_URL` config. The email service sends multilingual reminder emails and monthly summaries; `send_password_reset_email()` does not exist yet.

## Desired End State

A user clicks "Forgot password?" on the login page (active only when SMTP is configured), submits their email, receives a reset link, enters a new password, and is redirected to `/login`. The reset link is single-use and expires after `PASSWORD_RESET_TOKEN_EXPIRE_HOURS` hours. The endpoint never reveals whether an email is registered.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Reset URL construction | `APP_BASE_URL` env var | Explicit config works behind any reverse proxy; Host header spoofing is a known attack vector | Plan |
| Old token cleanup | Delete on new request | One valid link at a time — limits attack window for intercepted emails | Plan |
| Email language | `user.language_preference or "en"` | Consistent with how reminder emails already use the user's stored preference | Research |
| Token ID type | UUID PK | Specified in design spec — more opaque than int for an auth-adjacent table | Design spec |
| Migration authoring | Written manually | Alembic lessons-learned rule: autogenerate has silently missed columns before | Lessons |
| Unregistered email | Generic 200 always | Prevents user enumeration — spec requirement | Design spec |

## Scope

**In scope:**
- `password_reset_tokens` table + Alembic migration
- `APP_BASE_URL` + `PASSWORD_RESET_TOKEN_EXPIRE_HOURS` config fields
- `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/smtp-status`
- `send_password_reset_email()` with EN/PL/DE templates
- Login page conditional "Forgot password?" link
- `/forgot-password` and `/reset-password` pages
- i18n keys in all three locale files
- Backend unit tests (email) + integration tests (endpoints)

**Out of scope:**
- Rate limiting on the forgot-password endpoint
- Session invalidation on password change
- Frontend tests (no React testing infrastructure)
- Admin-initiated password resets

## Architecture / Approach

The backend token flow: `secrets.token_urlsafe(32)` generates the raw token; the stored value is its SHA-256 hex digest (64 chars). The raw token travels only in the email link; the server never re-exposes it. On reset, the incoming raw token is re-hashed and looked up by hash. Old tokens for a user are purged before a new one is inserted. The frontend reads `?token=` from the URL query string and POSTs it to `/auth/reset-password`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data Model, Migration, Config | `password_reset_tokens` table, `APP_BASE_URL` config | Migration must be written manually — autogenerate has missed columns before |
| 2. Backend Endpoints + Email | 3 endpoints, `send_password_reset_email()` | Reset URL construction depends on `APP_BASE_URL` being set correctly in each environment |
| 3. Backend Tests | Unit + integration test coverage | Expired/single-use token edge cases must be covered to prevent regressions |
| 4. Frontend Pages + i18n | 2 new pages, updated login, 3 locale files | Strict JSON required — no trailing commas in locale files |

**Prerequisites:** Docker environment running; `.env` has SMTP fields set for manual end-to-end verification in Phase 2.
**Estimated effort:** ~2-3 sessions across 4 phases.

## Open Risks & Assumptions

- `APP_BASE_URL` must be set correctly in production deployments (no automatic detection)
- SMTP must be configured for end-to-end manual testing of Phases 2 and 4
- Token expiry is UTC-based; servers in non-UTC timezones should be fine since `datetime.now(timezone.utc)` is used consistently throughout the codebase

## Success Criteria (Summary)

- A registered user can complete the full forgot-password → reset-password → login flow
- The "Forgot password?" link is conditionally hidden/shown based on SMTP configuration
- Replaying a used reset link returns a 400 error; submitting an unknown email returns the same success message as a known email
