# Reset Password Implementation Plan

## Overview

Add a standard email-token password reset flow to Pay Tracker. The feature has two phases: a "forgot password" request that sends a tokenized reset link, and a "reset password" confirmation that validates the token and updates the password hash.

## Current State Analysis

The existing auth system already provides all the infrastructure needed:
- JWT + HttpOnly cookies via `backend/app/core/security.py`
- bcrypt password hashing (`verify_password`, `hash_password`)
- Gmail SMTP via `backend/app/services/email.py` (multilingual: EN/PL/DE, HTML + plaintext)
- `language_preference: Mapped[str | None]` on the `User` model — used to select email language
- `backend/app/core/config.py` with Optional SMTP fields; `smtp_host is None` = not configured

Missing: no `password_reset_tokens` table, no reset endpoints, no `APP_BASE_URL` config, no frontend pages.

### Key Discoveries:

- `users.id` is `Mapped[int]` PK — `user_id` FK on the new table must be `Integer`
- Existing migration naming: short hex revision ID + `_description.py`; `down_revision` chains migrations
- Lessons learned mandate writing migrations **manually** (never trust autogenerate alone)
- Email service unit tests in `test_email_service.py` mock `smtplib.SMTP` — follow this pattern for the new email function
- Integration tests use `testcontainers.postgres` + FastAPI `TestClient` via `conftest.py`; `conftest.py` must import new model files so `Base.metadata.create_all` registers them
- `apiFetch` in the frontend uses `credentials: "include"` and parses `body.detail` for errors

## Desired End State

A user who has forgotten their password can click "Forgot password?" on the login page, submit their email, receive a reset link by email, set a new password, and log back in. The "Forgot password?" link is active only when SMTP is configured; without SMTP it is visually greyed out with an explanatory message. The reset link is single-use and expires after `PASSWORD_RESET_TOKEN_EXPIRE_HOURS` hours (0 = no expiry, for testing).

### Key Discoveries:

- Reset link URL format: `{APP_BASE_URL}/reset-password?token={raw_token}`
- `APP_BASE_URL` must be added to config — no existing mechanism to derive it
- Old tokens for a user are deleted when a new reset is requested (security: one valid link at a time)

## What We're NOT Doing

- Rate limiting on the forgot-password endpoint (deferred — not in spec)
- SMS or other delivery channels (email only)
- Admin-initiated password resets
- Invalidating existing login sessions on password change (the current password-change endpoint doesn't do this either)
- Frontend unit tests (no React testing infrastructure exists)

## Implementation Approach

Four sequential phases: (1) data model + config, (2) backend endpoints + email function, (3) backend tests, (4) frontend pages + i18n. Phases 1–3 are pure backend and can be verified independently of the frontend. Phase 4 is pure frontend.

## Critical Implementation Details

**Migration must be written manually.** Per the lessons-learned rule, do not run autogenerate and trust the output. Write `op.create_table(...)` explicitly. The `expires_at` column is nullable with no `server_default` — omit `server_default` per the Alembic nullable-column lesson.

**Token hash uniqueness.** `secrets.token_urlsafe(32)` produces a 43-character raw token; `hashlib.sha256(raw.encode()).hexdigest()` produces a 64-character hex digest. The `token_hash` column is `VARCHAR(64) UNIQUE` — the uniqueness constraint is load-bearing for the lookup query.

**Email language fallback.** The `send_password_reset_email` function accepts a `language` parameter. At the call site, pass `user.language_preference or "en"`.

---

## Phase 1: Data Model, Migration, Config

### Overview

Create the `PasswordResetToken` SQLAlchemy model, write the Alembic migration manually, add `APP_BASE_URL` and `PASSWORD_RESET_TOKEN_EXPIRE_HOURS` to config, and update `.env.example`.

### Changes Required:

#### 1. New model file

**File**: `backend/app/models/reset_token.py`

**Intent**: Define `PasswordResetToken` using the project's SQLAlchemy 2.0 `Mapped[]` / `mapped_column()` style. The model owns the `password_reset_tokens` table.

**Contract**: Columns match the design spec:
- `id: Mapped[uuid.UUID]` — PK, `default=uuid.uuid4`
- `user_id: Mapped[int]` — FK to `users.id`, `ondelete="CASCADE"`
- `token_hash: Mapped[str]` — `String(64)`, unique, indexed
- `expires_at: Mapped[datetime | None]` — `DateTime(timezone=True)`, no server_default
- `created_at: Mapped[datetime]` — `DateTime(timezone=True)`, `default=lambda: datetime.now(timezone.utc)`

Include a `relationship` back to `User` (no `back_populates` needed unless User navigates to tokens).

#### 2. Register model in test harness

**File**: `backend/tests/conftest.py`

**Intent**: Add `import app.models.reset_token  # noqa: F401` alongside the existing model imports so `Base.metadata.create_all` registers the new table for integration tests.

**Contract**: Insert after the existing `import app.models.user` line.

#### 3. Config additions

**File**: `backend/app/core/config.py`

**Intent**: Expose `APP_BASE_URL` (used by the endpoint to build the reset link URL) and `PASSWORD_RESET_TOKEN_EXPIRE_HOURS` (0 = no expiry).

**Contract**:
- `app_base_url: str = "http://localhost:3010"`
- `password_reset_token_expire_hours: int = 1`

Both are plain `str`/`int` fields with safe development defaults — no validator needed.

#### 4. .env.example additions

**File**: `.env.example`

**Intent**: Document the two new env vars so deployers know to set them.

**Contract**: Add under the SMTP block:
```
APP_BASE_URL=http://localhost:3010
PASSWORD_RESET_TOKEN_EXPIRE_HOURS=1
```

#### 5. Alembic migration

**File**: `backend/alembic/versions/<new-hex-id>_add_password_reset_tokens.py`

**Intent**: Create the `password_reset_tokens` table. Written manually — do not rely on autogenerate.

**Contract**:
- `down_revision` points to `c8ec16439b01` (current head)
- `upgrade()` calls `op.create_table("password_reset_tokens", ...)` with all columns and a `ForeignKeyConstraint` with `ondelete="CASCADE"`
- `downgrade()` calls `op.drop_table("password_reset_tokens")`
- `expires_at` column: `sa.DateTime(timezone=True), nullable=True` — no `server_default`

### Success Criteria:

#### Automated Verification:

- `docker compose exec backend uv run alembic upgrade head` — completes without error
- `docker compose exec backend psql -U paytracker -d paytracker -c "\d password_reset_tokens"` — shows all 5 columns with correct types and constraints

#### Manual Verification:

- Inspect migration file and confirm it contains explicit `op.create_table(...)` DDL (not just FK noise)
- Confirm `token_hash` column has both UNIQUE constraint and index

---

## Phase 2: Backend Endpoints and Email Function

### Overview

Add three new endpoints to `auth.py`, one new Pydantic schemas, and `send_password_reset_email()` to the email service.

### Changes Required:

#### 1. Pydantic schemas

**File**: `backend/app/schemas/auth.py`

**Intent**: Add request schemas for the two new POST endpoints.

**Contract**:
- `ForgotPasswordRequest(BaseModel)`: `email: EmailStr`
- `ResetPasswordRequest(BaseModel)`: `token: str`, `new_password: str`
- `SmtpStatusResponse(BaseModel)`: `configured: bool`

#### 2. Email function

**File**: `backend/app/services/email.py`

**Intent**: Add `send_password_reset_email()` following the exact same SMTP + multilingual pattern as `send_reminder_email()`.

**Contract**: Function signature:
```python
def send_password_reset_email(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str | None,
    smtp_password: str | None,
    smtp_use_tls: bool,
    from_addr: str,
    to_addr: str,
    reset_url: str,
    language: str,
) -> None:
```
Add email templates for `("reset_password", lang)` for `lang` in `["en", "pl", "de"]`. Body text includes `reset_url` via `str.format()`. Subject line in each language. Body should make clear the link expires after 1 hour (or is permanent if configured for no-expiry). Follow the same `starttls` → optional `login` → `send_message` sequence.

#### 3. New router endpoints

**File**: `backend/app/routers/auth.py`

**Intent**: Add the three endpoints specified in the design spec.

**`GET /auth/smtp-status`** (public, no auth):
- Contract: Returns `SmtpStatusResponse(configured=settings.smtp_host is not None)`

**`POST /auth/forgot-password`** (public, no auth):
- Contract: Look up user by email; if not found, return 200 generic message (no enumeration). If found:
  1. Delete any existing `PasswordResetToken` rows for `user.id`
  2. Generate `raw = secrets.token_urlsafe(32)`
  3. Compute `token_hash = hashlib.sha256(raw.encode()).hexdigest()`
  4. Compute `expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.password_reset_token_expire_hours)` if `settings.password_reset_token_expire_hours > 0`, else `None`
  5. Insert new `PasswordResetToken` row
  6. Call `send_password_reset_email(...)` with `reset_url=f"{settings.app_base_url}/reset-password?token={raw}"` and `language=user.language_preference or "en"`
  7. Return `{"message": "If that email is registered, you'll receive a reset link shortly."}`
- Returns same 200 message regardless of whether email was found

**`POST /auth/reset-password`** (public, no auth):
- Contract: 
  1. Hash incoming `token`: `token_hash = hashlib.sha256(token.encode()).hexdigest()`
  2. Look up `PasswordResetToken` by `token_hash`; return 400 if not found
  3. Check `expires_at`: if not None and `expires_at < datetime.now(timezone.utc)`, delete row, return 400 "Token has expired"
  4. Validate `len(new_password) >= 8`; return 400 if not
  5. Update `user.password_hash = hash_password(new_password)`
  6. Delete the `PasswordResetToken` row (single-use)
  7. Return 200 `{"message": "Password updated successfully."}`

### Success Criteria:

#### Automated Verification:

- `cd frontend && npm run lint` — passes (no frontend changes yet, but baseline check)
- `docker compose up --build` — containers start; `GET http://localhost:8010/auth/smtp-status` returns `{"configured": false}` when SMTP is not set
- `http://localhost:8010/docs` — all 3 new endpoints appear in the Swagger UI

#### Manual Verification:

- With SMTP configured: `POST /auth/forgot-password` with a registered email sends a real email containing the reset link
- `POST /auth/reset-password` with the token from the email returns 200 and `password_hash` is updated in DB
- Replaying the same token returns 400 (token deleted)
- Submitting an unregistered email returns the same 200 generic message

---

## Phase 3: Backend Tests

### Overview

Unit tests for the email function (mock SMTP) and integration tests for all three new endpoints (testcontainers).

### Changes Required:

#### 1. Unit tests for email function

**File**: `backend/tests/test_email_service.py`

**Intent**: Append unit tests for `send_password_reset_email` following the existing pattern in the file (patch `smtplib.SMTP`, verify `send_message` called, check subject per language).

**Contract**: Test cases:
- `test_reset_email_sends_via_smtp` — verifies `starttls` + `login` + `send_message` sequence
- `test_reset_email_subject_en`, `test_reset_email_subject_pl`, `test_reset_email_subject_de` — parametrized or separate; verify subject contains expected text in each language
- `test_reset_email_body_contains_url` — verify the `reset_url` appears in the sent message body
- `test_reset_email_no_login_when_no_smtp_user` — follows `test_no_login_when_smtp_user_is_none` pattern

#### 2. Integration tests for reset-password endpoints

**File**: `backend/tests/test_reset_password.py`

**Intent**: New test file covering the full flow using the `client` fixture (real PostgreSQL via testcontainers, mocked SMTP).

**Contract**: Test cases (mock `send_password_reset_email` to avoid real SMTP):
- `test_smtp_status_unconfigured` — `GET /auth/smtp-status` returns `{"configured": false}` when no SMTP env
- `test_smtp_status_configured` — override settings, returns `{"configured": true}`
- `test_forgot_password_unknown_email_returns_200` — unregistered email still returns generic 200
- `test_forgot_password_creates_token_row` — registered email → DB row created in `password_reset_tokens`
- `test_forgot_password_replaces_old_token` — second request deletes first token, only one row remains
- `test_reset_password_success` — valid token → 200, password hash updated, token row deleted
- `test_reset_password_invalid_token_returns_400` — garbage token returns 400
- `test_reset_password_expired_token_returns_400` — token with `expires_at` in the past returns 400
- `test_reset_password_too_short_returns_400` — password < 8 chars returns 400
- `test_reset_password_token_is_single_use` — replaying same token after success returns 400

### Success Criteria:

#### Automated Verification:

- `docker compose exec backend uv run pytest backend/tests/test_reset_password.py -v` — all tests pass
- `docker compose exec backend uv run pytest backend/tests/test_email_service.py -v` — all tests (including new) pass

#### Manual Verification:

- No test relies on a live SMTP server — all email sends are mocked
- All edge cases (expired, replayed, unknown email) covered

---

## Phase 4: Frontend Pages and i18n

### Overview

Update the login page to conditionally show the "Forgot password?" link, add two new public pages (`/forgot-password` and `/reset-password`), and add i18n keys to all three locale files.

### Changes Required:

#### 1. Locale files — Auth keys

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent**: Add keys for the two new pages and the login-page link. All keys live in the existing `Auth` section. Also add a new `Common` section for `smtpNotConfigured`.

**Contract** — key names and English values:
```json
"Auth": {
  "...existing keys...",
  "forgotPassword": "Forgot password?",
  "forgotPasswordTitle": "Reset your password",
  "forgotPasswordSubtitle": "Enter your email and we'll send you a reset link.",
  "sendResetLink": "Send reset link",
  "sendingResetLink": "Sending…",
  "resetLinkSent": "If that email is registered, you'll receive a reset link shortly.",
  "resetPasswordTitle": "Set a new password",
  "resetPasswordSubtitle": "Enter and confirm your new password.",
  "newPasswordLabel": "New password",
  "confirmPasswordLabel": "Confirm new password",
  "passwordsDoNotMatch": "Passwords do not match",
  "setPassword": "Set new password",
  "settingPassword": "Updating…",
  "invalidOrExpiredToken": "This link has expired or is invalid.",
  "requestNewLink": "Request a new link"
}
```
```json
"Common": {
  "smtpNotConfigured": "Email is not configured. Contact the administrator."
}
```

Provide accurate PL and DE translations in the respective files. Follow strict JSON (no trailing commas).

#### 2. Login page — smtp-status fetch + conditional link

**File**: `frontend/src/app/login/page.tsx`

**Intent**: Fetch `GET /auth/smtp-status` on mount; conditionally render "Forgot password?" as an active link or a greyed-out label with `Common.smtpNotConfigured` below it.

**Contract**:
- Add `useState<boolean>(false)` for `smtpConfigured`
- Add `useEffect` that calls `apiFetch<{ configured: boolean }>("/auth/smtp-status")` and sets state
- Below the submit button, render:
  - If `smtpConfigured`: `<Link href="/forgot-password">` with `Auth.forgotPassword` text
  - If not `smtpConfigured`: greyed-out span with `Auth.forgotPassword` text + `<p>` with `Common.smtpNotConfigured` in smaller muted style below

#### 3. New page — /forgot-password

**File**: `frontend/src/app/forgot-password/page.tsx`

**Intent**: Public page (no auth guard) matching the login/register visual style. Email input + submit button. On success: show `Auth.resetLinkSent` static message (no redirect). On error: red alert box.

**Contract**:
- Same full-screen centered layout as login/register: `min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900`
- Same card: `rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:bg-slate-800 dark:border-slate-700`
- Same logo/title block
- `useState<boolean>(false)` for `sent` state; when `sent === true`, replace form with `Auth.resetLinkSent` paragraph (no form)
- `apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) })`
- Footer: link back to `/login`

#### 4. New page — /reset-password

**File**: `frontend/src/app/reset-password/page.tsx`

**Intent**: Public page. Reads `?token=` from URL search params. New password + confirm password fields. On success: redirect to `/login`. On expired/invalid: inline error + link to `/forgot-password`.

**Contract**:
- Use `useSearchParams()` to read `token`
- Two password inputs: `newPasswordLabel` and `confirmPasswordLabel`
- Client-side validation: `new_password === confirm_password`; if not: show `Auth.passwordsDoNotMatch` error (do not call API)
- `apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) })`
- On success (200): `router.push("/login")`
- On 400 error from API: show `Auth.invalidOrExpiredToken` + link to `/forgot-password` using `Auth.requestNewLink`
- Same card/layout as login/register

### Success Criteria:

#### Automated Verification:

- `cd frontend && npm run lint` — passes with no errors
- `cd frontend && npx tsc --noEmit` — no TypeScript errors

#### Manual Verification:

- With SMTP configured: "Forgot password?" link is active on `/login`
- Without SMTP: link is grey + `Common.smtpNotConfigured` message appears
- Submit a registered email on `/forgot-password` → success message shown
- Submit an unregistered email → same success message (no enumeration)
- Click reset link → `/reset-password?token=xxx` loads, enter + confirm new password → redirect to `/login` → log in with new password succeeds
- Replay same reset link → 400 error + link to request new link shown
- Set `PASSWORD_RESET_TOKEN_EXPIRE_HOURS=0`, restart → reset link works indefinitely
- Password mismatch in confirm field → client-side error, API not called

---

## Testing Strategy

### Unit Tests:

- `send_password_reset_email` — SMTP sequence, subject per language (EN/PL/DE), URL in body, no-login-when-no-smtp-user

### Integration Tests:

- All three endpoints using `client` fixture (testcontainers PostgreSQL, mocked email send)
- Full flow: register → forgot-password → extract token from DB → reset-password → login with new password

### Manual Testing Steps:

1. `docker compose down -v && docker compose up --build` — confirm migration runs, `password_reset_tokens` table exists
2. With SMTP configured: confirm "Forgot password?" is active on login page
3. Submit registered email → receive email containing `/reset-password?token=...` link
4. Click link → fill new password → redirect to `/login` → log in with new password
5. Replay the same link → 400 error with "Request a new link" shown
6. Set `PASSWORD_RESET_TOKEN_EXPIRE_HOURS=0`, restart → link works indefinitely
7. Without SMTP: "Forgot password?" is grey + inline message visible
8. Unregistered email → same generic success message

## Migration Notes

The migration creates a new table with no backfill required. `downgrade()` simply drops the table. Safe to apply on a live DB with no downtime concern.

## References

- Design spec / frame: `context/changes/reset-password/change.md`
- Email service: `backend/app/services/email.py`
- Auth router: `backend/app/routers/auth.py`
- Auth schemas: `backend/app/schemas/auth.py`
- Config: `backend/app/core/config.py`
- Lessons: `context/foundation/lessons.md` (Alembic rules, nullable columns)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Model, Migration, Config

#### Automated

- [x] 1.1 `alembic upgrade head` completes without error
- [x] 1.2 `\d password_reset_tokens` shows all 5 columns with correct types

#### Manual

- [x] 1.3 Migration file contains explicit `op.create_table(...)` DDL (not just FK noise)
- [x] 1.4 `token_hash` column has both UNIQUE constraint and index

### Phase 2: Backend Endpoints and Email Function

#### Automated

- [x] 2.1 `docker compose up --build` — containers start cleanly
- [x] 2.2 `GET /auth/smtp-status` returns `{"configured": false}` without SMTP config

#### Manual

- [x] 2.3 All 3 new endpoints appear in Swagger UI at `http://localhost:8010/docs`
- [x] 2.4 `POST /auth/forgot-password` with registered email sends real email with reset link
- [x] 2.5 `POST /auth/reset-password` with valid token returns 200; replaying same token returns 400
- [x] 2.6 Unregistered email returns same generic 200 message

### Phase 3: Backend Tests

#### Automated

- [x] 3.1 `pytest backend/tests/test_reset_password.py -v` — all tests pass
- [x] 3.2 `pytest backend/tests/test_email_service.py -v` — all tests pass (including new)

#### Manual

- [x] 3.3 No test relies on a live SMTP server
- [x] 3.4 Expired token and replayed token edge cases are covered

### Phase 4: Frontend Pages and i18n

#### Automated

- [x] 4.1 `npm run lint` passes
- [x] 4.2 `npx tsc --noEmit` passes with no TypeScript errors in src/

#### Manual

- [x] 4.3 SMTP configured: "Forgot password?" link is active on `/login`
- [x] 4.4 SMTP not configured: link is grey + `Common.smtpNotConfigured` message
- [x] 4.5 Full reset flow works end-to-end: email → link → new password → login
- [x] 4.6 Replayed reset link shows error + "Request a new link"
- [x] 4.7 Password mismatch validated client-side before API call
