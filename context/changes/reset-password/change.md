---
change_id: reset-password
title: Reset password
status: implemented
created: 2026-06-24
updated: 2026-06-24
archived_at: null
---

## Notes

# Reset Password — Design Spec

## Context

Pay Tracker has no way to recover a forgotten password. The existing auth system (JWT + HttpOnly cookies, bcrypt, Gmail
SMTP) provides all the infrastructure needed. This spec adds a standard email-token reset flow as a gap-fill.

---

## Flow

Two phases, each with one API endpoint:

1. **Request phase** — user submits their email on `/forgot-password`. Backend silently ignores unknown emails,
   generates a secure random token, stores a SHA-256 hash in `password_reset_tokens`, and sends the reset email.
   Response is always a generic 200 (no user enumeration).

2. **Reset phase** — user clicks the link (`/reset-password?token=<raw>`), enters and confirms a new password. Backend
   hashes the token, looks it up, checks expiry, updates `password_hash`, deletes the token row. Frontend redirects to
   `/login` on success.

---

## Backend

### New DB table — `password_reset_tokens`

New Alembic migration required.

| Column       | Type                        | Notes                          |
|--------------|-----------------------------|--------------------------------|
| `id`         | UUID PK                     |                                |
| `user_id`    | FK → `users.id`             | CASCADE DELETE                 |
| `token_hash` | VARCHAR(64) UNIQUE, indexed | SHA-256 of raw token           |
| `expires_at` | TIMESTAMPTZ, nullable       | NULL = never expires (testing) |
| `created_at` | TIMESTAMPTZ                 |                                |

### New env var

```
PASSWORD_RESET_TOKEN_EXPIRE_HOURS=1   # 0 = no expiry (testing)
```

Added to `.env.example` and loaded in `backend/app/core/config.py`.

### New endpoints — `backend/app/routers/auth.py`

**`POST /auth/forgot-password`**

- Body: `{ email: str }`
- Looks up user by email (no error if not found)
- Generates `secrets.token_urlsafe(32)`, stores SHA-256 hash + expiry
- Sends reset email via existing `backend/app/services/email.py` SMTP path
- Returns `{ message: "If that email is registered, you'll receive a reset link shortly." }` always

**`POST /auth/reset-password`**

- Body: `{ token: str, new_password: str }`
- SHA-256 hashes the token, looks up matching row
- Returns 400 if not found or expired
- Enforces 8-character minimum on new password
- Updates `password_hash` on User, deletes the token row
- Returns 200 on success

**`GET /auth/smtp-status`** (public, no auth)

- Returns `{ configured: bool }` based on whether `settings.smtp_host` is set
- Used by the login page to conditionally activate the "Forgot password?" link

### Email template — `backend/app/services/email.py`

New function `send_password_reset_email(to_email, reset_url)` following the existing multi-language pattern (en/pl/de).
Same SMTP path as reminder emails.

---

## Frontend

### Login page — `frontend/src/app/login/page.tsx`

- Fetches `GET /auth/smtp-status` on mount
- If configured: renders "Forgot password?" link → `/forgot-password`
- If not configured: renders greyed-out "Forgot password?" + inline `Common.smtpNotConfigured` message below it

### New page — `frontend/src/app/forgot-password/page.tsx`

- Public route (no auth guard), matches `/login` and `/register` styling
- Email input + submit button
- On success: static message "If that email is registered, you'll receive a reset link shortly."
- Uses existing `apiFetch` pattern → `POST /auth/forgot-password`

### New page — `frontend/src/app/reset-password/page.tsx`

- Public route, reads `?token=` from URL query params
- New password + confirm password fields (8-char minimum)
- On success: redirect to `/login`
- On expired/invalid token: inline error + link back to `/forgot-password`
- Uses `apiFetch` → `POST /auth/reset-password`

### i18n — locale files

New `Common` section added to all three locale files:

- `frontend/messages/en.json`
- `frontend/messages/pl.json`
- `frontend/messages/de.json`

Keys needed (at minimum):

```json
"Common": {
"smtpNotConfigured": "Email is not configured. Contact the administrator."
}
```

New `Auth` keys for the forgot/reset pages (forgotPassword, checkYourEmail, resetPassword, etc.) follow the existing
`Auth` section pattern.

---

### Test

Add necessary tests, unit or integration to cover this functionality.

## Verification

1. `docker compose up --build` — confirm migration runs, new table exists
2. With SMTP configured: "Forgot password?" link is active on login page
3. Submit a registered email → receive reset email with working link
4. Click link → fill new password → redirect to `/login` → log in with new password
5. Replay the same link after reset → 400 invalid token
6. Set `PASSWORD_RESET_TOKEN_EXPIRE_HOURS=0` → link works indefinitely (testing mode)
7. With SMTP not configured: "Forgot password?" link is greyed out with inline message
8. Submit an unregistered email → same generic success message (no enumeration)
