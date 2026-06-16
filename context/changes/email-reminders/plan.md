# Email Reminders (S-10) Implementation Plan

## Overview

Implement FR-012: daily email reminders for upcoming (1 day before due date) and overdue (first day past due, unpaid) payments. APScheduler runs inside the FastAPI process, sends plain-text emails via SMTP in the user's preferred language (en/pl/de), and tracks sent state on `PaymentInstance` to prevent duplicates. Users can opt out via a bell-icon toggle in the dashboard header.

## Current State Analysis

- `backend/app/core/config.py:13–18` — SMTP config stubs exist (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `reminder_from`), all optional/None by default.
- `backend/app/models/user.py` — `User` has `email`, `language_preference`, `is_active`. No opt-out field.
- `backend/app/models/bill.py:73–99` — `PaymentInstance` has `due_date`, `status`, `paid_at`. No reminder tracking fields.
- `backend/app/main.py` — plain `FastAPI()` instantiation, no lifespan, no scheduler.
- `backend/app/services/` — only `recurrence.py`; no email service exists.
- `backend/pyproject.toml` — no APScheduler. `smtplib` is stdlib (no new dep for email sending).
- `backend/app/routers/export.py:171` — restore check is `schema_version != 2`; must relax to `not in {2, 3}`.
- `frontend/src/lib/user-api.ts` — `UserProfile` has `email` and `language_preference`; `updateMe` typed to `{ language_preference: string }`. Both need extension.
- `frontend/src/context/locale-context.tsx` — established pattern: `fetchMe()` on auth, `updateMe()` to persist. `EmailRemindersToggle` follows the same shape.

## Desired End State

When SMTP is configured and `email_reminders_enabled = True` for a user:
- 1 day before `due_date`: user receives a plain-text email in their language with bill name, due date, amount, currency.
- First day the payment is overdue (`due_date < today`, still unpaid): user receives a second email.
- Each email sent exactly once per instance (idempotent via DB flags).
- SMTP absent → scheduler logs a warning and exits cleanly; app starts normally in dev/test.
- Users toggle opt-out from the dashboard header (bell icon). Persists via `PATCH /auth/me`.
- Backup/restore works for schema v2 (old, flags default False) and v3 (new, flags included).

### Key Discoveries

- `smtplib` is stdlib — no new dependency for email sending.
- `apscheduler>=3.11` must be added to `pyproject.toml`.
- Restore version check at `export.py:171` is a single `!= 2` guard — minimal change to relax.
- `BackupInstance` schema (`schemas/bill.py:82–93`) uses optional fields with defaults — adding reminder flags with `= False` is backward-compatible for v2 restores.
- `user-api.ts` `updateMe` parameter type is narrow (`{ language_preference: string }`) — needs widening.
- `PaymentStatus.overdue` is a computed concept in the API layer, not stored in the DB. The scheduler must detect overdue by `due_date < today AND status != paid`, not by reading `status == overdue`.

## What We're NOT Doing

- No HTML emails — plain text only.
- No per-bill reminder preferences — global opt-in/out only.
- No one-click unsubscribe in emails (private household app).
- No configurable timing per user — fixed: 1 day before + first overdue day.
- No retry queue on SMTP failure — failed sends leave the flag unset; next day's run retries.
- No Celery/Redis — APScheduler in-process is sufficient at household scale.

## Implementation Approach

Five phases in strict dependency order: schema (DB columns + migration) → API updates (profile endpoint + backup compat) → email service (pure function, no scheduler coupling) → scheduler (job + FastAPI lifespan wiring) → frontend toggle. Each phase is independently testable before the next begins.

## Critical Implementation Details

**Overdue detection in the scheduler**: `PaymentStatus.overdue` is never written to the DB — it's computed dynamically in API responses. The scheduler query must use `PaymentInstance.due_date < today AND PaymentInstance.status != PaymentStatus.paid`. Querying `status == overdue` will return zero rows.

**`server_default` on new boolean columns**: The migration must include `server_default="false"` / `server_default="true"` so PostgreSQL fills existing rows without a Python-level backfill. Without it, the `NOT NULL` constraint will cause the migration to fail on a live database that already has rows.

---

## Phase 1: Data Model + Migration

### Overview

Add three boolean columns to the DB: `reminder_sent_upcoming` and `reminder_sent_overdue` on `PaymentInstance` (idempotency), and `email_reminders_enabled` on `User` (opt-out). Single Alembic migration covers all three.

### Changes Required

#### 1. PaymentInstance model

**File**: `backend/app/models/bill.py`

**Intent**: Track whether each reminder type has been sent for this instance so the scheduler never re-sends.

**Contract**: Two `Mapped[bool]` columns added after `notes`, before `created_at`, both `nullable=False, server_default="false"`:
- `reminder_sent_upcoming`
- `reminder_sent_overdue`

#### 2. User model

**File**: `backend/app/models/user.py`

**Intent**: Allow users to globally disable reminder emails; scheduler skips users where this is False.

**Contract**: One `Mapped[bool]` column added after `language_preference`, `nullable=False, default=True, server_default="true"`:
- `email_reminders_enabled`

#### 3. Alembic migration

**File**: new revision — `docker compose exec backend uv run alembic revision --autogenerate -m "add_email_reminder_fields"`

**Intent**: Apply the three column additions to the live PostgreSQL database.

**Contract**: Verify the generated file adds columns to `payment_instances` (two booleans) and `users` (one boolean), each with the correct `server_default`. Run `alembic upgrade head` to apply.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `docker compose exec backend uv run alembic upgrade head`
- Columns visible: `docker compose exec backend uv run python -c "from app.models.bill import PaymentInstance; print([c.name for c in PaymentInstance.__table__.columns])"`

#### Manual Verification

- `docker compose exec backend psql $DATABASE_URL -c "\d payment_instances"` shows `reminder_sent_upcoming` and `reminder_sent_overdue` with `false` default.
- Same for `\d users` showing `email_reminders_enabled` with `true` default.

---

## Phase 2: Backend Schema + API Updates

### Overview

Expose `email_reminders_enabled` via the auth profile API; add reminder flags to the backup schema (v3); update the JSON export to include them; relax the restore version guard to accept both v2 and v3.

### Changes Required

#### 1. Auth schemas

**File**: `backend/app/schemas/auth.py`

**Intent**: Surface the new opt-out field in profile read/write so the frontend toggle can persist its state.

**Contract**:
- `UserProfileOut`: add `email_reminders_enabled: bool`
- `UserProfileUpdate`: add `email_reminders_enabled: bool | None = None`

#### 2. Auth router — PATCH /auth/me

**File**: `backend/app/routers/auth.py`

**Intent**: Apply `email_reminders_enabled` when provided, mirroring how `language_preference` is handled today.

**Contract**: In the PATCH handler, after the `language_preference` conditional update, add an equivalent block for `email_reminders_enabled`.

#### 3. Backup schema — BackupInstance

**File**: `backend/app/schemas/bill.py`

**Intent**: Include reminder state in backups so a restore doesn't re-trigger already-sent emails.

**Contract**: Add to `BackupInstance`:
- `reminder_sent_upcoming: bool = False`
- `reminder_sent_overdue: bool = False`

Both have defaults — Pydantic supplies `False` for v2 backups missing these fields.

#### 4. JSON export

**File**: `backend/app/routers/export.py` (around line 107)

**Intent**: New exports capture reminder state so restores preserve it.

**Contract**: In the `payment_instances` dict inside the export handler, bump `"schema_version": 2` → `3` and add per-instance:
- `"reminder_sent_upcoming": i.reminder_sent_upcoming`
- `"reminder_sent_overdue": i.reminder_sent_overdue`

#### 5. Restore — accept v2 and v3

**File**: `backend/app/routers/export.py:171`

**Intent**: Old v2 backups must still restore; new v3 backups are now the default export format.

**Contract**: Change `if raw.get("schema_version") != 2:` → `if raw.get("schema_version") not in {2, 3}:`.

### Success Criteria

#### Automated Verification

- `GET /auth/me` response includes `email_reminders_enabled: true`
- `PATCH /auth/me {"email_reminders_enabled": false}` returns `email_reminders_enabled: false` and persists
- `GET /export/json` response has `schema_version: 3` and reminder flags on each payment instance
- Restore with a v2 backup returns 200; restore with a v3 backup returns 200

#### Manual Verification

- Export backup, open JSON — verify `schema_version: 3` and per-instance reminder flags present.
- Restore the v3 backup — succeeds.
- Restore an old v2 backup — also succeeds, no 422.

---

## Phase 3: Email Service

### Overview

A pure function module that composes and sends a single plain-text reminder email via SMTP. No scheduler coupling — the function takes all SMTP settings and message parameters, returns on success, raises `smtplib.SMTPException` on failure.

### Changes Required

#### 1. Email service module

**File**: `backend/app/services/email.py` (new)

**Intent**: Encapsulate SMTP connection, STARTTLS handshake, and template rendering so the scheduler can call one function without touching `smtplib` directly, and unit tests can mock at the module boundary.

**Contract**: Public function:

```python
def send_reminder_email(
    *,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str | None,
    smtp_password: str | None,
    from_addr: str,
    to_addr: str,
    bill_name: str,
    due_date: date,
    amount: Decimal,
    currency: str,
    is_overdue: bool,
    language: str,  # "en" | "pl" | "de"; unknown values fall back to "en"
) -> None
```

Templates are inline string dicts keyed by `(is_overdue, language)`. Always uses STARTTLS (port 587 default). Calls `login()` only when `smtp_user` is provided. Raises on send failure — caller decides whether to flip the DB flag.

**Templates** (subject line pattern per language × type):

| | `is_overdue=False` | `is_overdue=True` |
|---|---|---|
| en | `Reminder: {bill_name} due tomorrow ({amount} {currency})` | `Overdue: {bill_name} was due {due_date} ({amount} {currency})` |
| pl | `Przypomnienie: {bill_name} płatne jutro ({amount} {currency})` | `Zaległość: {bill_name} było płatne {due_date} ({amount} {currency})` |
| de | `Erinnerung: {bill_name} fällig morgen ({amount} {currency})` | `Überfällig: {bill_name} war fällig {due_date} ({amount} {currency})` |

Body mirrors the subject and adds the app name and a note to manage reminders in the app.

### Success Criteria

#### Automated Verification

- Unit test (mock `smtplib.SMTP`): verifies call order — `starttls()`, `login()` (only when creds provided), `sendmail()`, `quit()`.
- All 6 language × type subject combinations produce the expected string.
- Unknown language code (e.g. `"xx"`) falls back to English subject.

#### Manual Verification

- Invoke function in a Python shell with a real SMTP provider (e.g. Mailtrap) and confirm email arrives with correct subject, body, and language.

---

## Phase 4: Scheduler + Wiring

### Overview

Add APScheduler, write the daily job function, and wire it into FastAPI's lifespan. Job runs at 08:00 UTC, checks SMTP config first, then queries all users/instances needing a reminder and sends.

### Changes Required

#### 1. APScheduler dependency

**File**: `backend/pyproject.toml`

**Intent**: Provide the in-process scheduler without a separate container.

**Contract**: Add `"apscheduler>=3.11"` to the `dependencies` list. Rebuild Docker image after `uv lock`.

#### 2. Reminder job function

**File**: `backend/app/services/reminder_job.py` (new)

**Intent**: The scheduled function that finds instances needing reminders and sends them. Idempotent — sent flags prevent duplicate emails even if the job runs twice.

**Contract**: `send_daily_reminders(SessionLocal) -> None` (sync).

Logic:
1. If `settings.smtp_host is None` → `logger.warning("SMTP not configured, skipping reminders")` and return.
2. `today = date.today()`
3. Open DB session; query `User` where `is_active=True AND email_reminders_enabled=True`.
4. For each user, two queries joined through `BillTemplate.user_id`:
   - **Upcoming**: `PaymentInstance` where `due_date == today + timedelta(days=1) AND status != paid AND reminder_sent_upcoming == False`
   - **Overdue**: `PaymentInstance` where `due_date < today AND status != paid AND reminder_sent_overdue == False`
5. For each match: call `send_reminder_email(...)`. On success → flip the flag + commit. On `SMTPException` → log error, continue (flag stays False, retried tomorrow).
6. Close session.

#### 3. FastAPI lifespan + scheduler registration

**File**: `backend/app/main.py`

**Intent**: Start the scheduler at app startup and shut it down cleanly on exit, using the FastAPI lifespan pattern.

**Contract**: Wrap `app = FastAPI(...)` with a `@asynccontextmanager` lifespan that creates an `AsyncIOScheduler`, adds the daily job (cron `hour=8, minute=0`), starts it before `yield`, and calls `scheduler.shutdown()` after. The job is dispatched via `run_in_executor` to keep the async event loop unblocked.

### Success Criteria

#### Automated Verification

- Unit test: `smtp_host=None` → warning logged, `send_reminder_email` never called.
- Unit test: upcoming instance (`due_date=tomorrow, status=upcoming, reminder_sent_upcoming=False`) → email sent, flag flipped.
- Unit test: overdue instance (`due_date=yesterday, status=upcoming, reminder_sent_overdue=False`) → email sent, flag flipped.
- Unit test: `reminder_sent_upcoming=True` already → no email sent.
- Unit test: `email_reminders_enabled=False` on user → no email sent.
- App starts cleanly: `docker compose up` shows no scheduler errors in logs; `GET /health` returns 200.

#### Manual Verification

- Set a bill's `due_date` to tomorrow; trigger job manually (or wait for 08:00 UTC); confirm email arrives and `reminder_sent_upcoming = true` in DB.
- Remove SMTP vars from `.env`, restart app — `/health` still returns 200, no crash.

---

## Phase 5: Frontend Toggle

### Overview

A bell-icon toggle in the dashboard header (desktop and mobile) that reads and writes `email_reminders_enabled` via `GET/PATCH /auth/me`. Follows the `LanguageToggle` + `locale-context` pattern from S-07.

### Changes Required

#### 1. Extend user-api.ts

**File**: `frontend/src/lib/user-api.ts`

**Intent**: Add the new field to the TypeScript type so the component is correctly typed end-to-end.

**Contract**:
- Add `email_reminders_enabled: boolean` to the `UserProfile` interface.
- Widen `updateMe` parameter from `{ language_preference: string }` to `Partial<Pick<UserProfile, "language_preference" | "email_reminders_enabled">>`.

#### 2. EmailRemindersToggle component

**File**: `frontend/src/components/EmailRemindersToggle.tsx` (new)

**Intent**: Let users toggle reminder emails on/off from the header with immediate visual feedback and optimistic update.

**Contract**: Client component that:
- On mount: calls `fetchMe()` to read initial `email_reminders_enabled`.
- Renders a `<button>` with `Bell` icon (enabled) or `BellOff` icon (disabled) from `lucide-react`.
- On click: optimistically flips local state, calls `updateMe({ email_reminders_enabled: !current })`; reverts on failure.
- `aria-label` from i18n key; `aria-pressed` reflects current state.
- Styled to match `ThemeToggle` (existing `rounded-lg p-2 text-slate-600 hover:bg-slate-100 ...` pattern).

#### 3. Wire into dashboard layout

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Make the toggle reachable in both desktop and mobile views.

**Contract**:
- Import `EmailRemindersToggle`.
- Desktop (line 84 area): add `<EmailRemindersToggle />` next to `<LanguageToggle />`.
- Mobile dropdown (line 134 area): add `<EmailRemindersToggle />` in the utility icons row alongside `<BackupButton />` and `<ThemeToggle />`.

#### 4. i18n message keys

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent**: Provide translated aria-labels for the toggle button.

**Contract**: Add `"EmailRemindersToggle"` section to each file:
- en: `{ "enable": "Enable email reminders", "disable": "Disable email reminders" }`
- pl: `{ "enable": "Włącz przypomnienia e-mail", "disable": "Wyłącz przypomnienia e-mail" }`
- de: `{ "enable": "E-Mail-Erinnerungen aktivieren", "disable": "E-Mail-Erinnerungen deaktivieren" }`

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes with no errors.
- `cd frontend && npm run build` passes (TypeScript clean).

#### Manual Verification

- Dashboard header shows Bell icon.
- Clicking it sends `PATCH /auth/me {"email_reminders_enabled": false}` (visible in DevTools Network).
- Icon changes to BellOff; page reload restores BellOff state (fetched from API).
- Re-enabling reverts to Bell.
- Mobile: hamburger menu shows toggle; it works identically.

---

## Testing Strategy

### Unit Tests

- `backend/tests/test_email_service.py`: mock `smtplib.SMTP`; 6 subject-line combos; STARTTLS + login flow; unknown-language fallback.
- `backend/tests/test_reminder_job.py`: mock DB + `send_reminder_email`; 5 scenarios (no SMTP, upcoming send+flip, overdue send+flip, already-sent skip, opt-out skip).

### Integration Tests

- Extend `backend/tests/test_user_scoping.py` pattern: two users, one with `email_reminders_enabled=False` — verify only the enabled user's instances appear in the scheduler's query result.

### Manual Testing Steps

1. Configure SMTP vars in `.env` (Mailtrap or Gmail).
2. Create a bill with `due_date = tomorrow`; verify `reminder_sent_upcoming = false` in DB.
3. Trigger the scheduler job (or wait for 08:00 UTC); verify email arrives; verify flag flipped in DB.
4. Set a bill's `due_date = yesterday` (unpaid); verify overdue email on next run.
5. Disable reminders via UI toggle; verify no email sent on next run.
6. Export backup (v3), restore it — flags preserved, no duplicate emails.
7. Restore an old v2 backup — succeeds, flags default to False.
8. Remove SMTP vars from `.env`, restart — `/health` returns 200, no startup errors.

## References

- PRD FR-012: `context/foundation/prd.md`
- Roadmap S-10: `context/foundation/roadmap.md`
- Recurrence service (pattern to follow): `backend/app/services/recurrence.py`
- Locale-context (profile API pattern): `frontend/src/context/locale-context.tsx`
- User-api (fetch/update profile): `frontend/src/lib/user-api.ts`
- Restore version guard: `backend/app/routers/export.py:171`
- SMTP config stubs: `backend/app/core/config.py:13–18`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data Model + Migration

#### Automated

- [x] 1.1 Migration applies cleanly: `alembic upgrade head`
- [x] 1.2 New columns visible in `payment_instances` and `users` tables

#### Manual

- [x] 1.3 Spot-check via `\d payment_instances` and `\d users` in psql

### Phase 2: Backend Schema + API Updates

#### Automated

- [x] 2.1 `GET /auth/me` returns `email_reminders_enabled`
- [x] 2.2 `PATCH /auth/me {"email_reminders_enabled": false}` persists and returns false
- [x] 2.3 `GET /export/json` returns `schema_version: 3` with reminder flags per instance
- [x] 2.4 Restore succeeds for both v2 and v3 backup files

#### Manual

- [x] 2.5 Exported JSON has `schema_version: 3` and per-instance reminder flags
- [x] 2.6 Restore v2 backup — no 422

### Phase 3: Email Service

#### Automated

- [x] 3.1 Unit test: STARTTLS + login + sendmail + quit sequence verified
- [x] 3.2 Unit test: all 6 language × type subject combinations correct
- [x] 3.3 Unit test: unknown language falls back to English

#### Manual

- [x] 3.4 Test email arrives via real SMTP with correct content

### Phase 4: Scheduler + Wiring

#### Automated

- [x] 4.1 Unit test: SMTP absent → warning logged, no email sent
- [x] 4.2 Unit test: upcoming instance → email sent, flag flipped
- [x] 4.3 Unit test: overdue instance → email sent, flag flipped
- [x] 4.4 Unit test: already-sent flag → email NOT re-sent
- [x] 4.5 Unit test: `email_reminders_enabled=False` → email NOT sent
- [x] 4.6 App starts cleanly with scheduler (`docker compose up`)

#### Manual

- [x] 4.7 Scheduler sends upcoming reminder and flips flag in DB
- [x] 4.8 App starts without errors when SMTP vars absent

### Phase 5: Frontend Toggle

#### Automated

- [x] 5.1 `npm run lint` passes
- [x] 5.2 `npm run build` passes

#### Manual

- [x] 5.3 Bell icon visible in desktop header; BellOff on disable
- [x] 5.4 Toggle persists across page reload
- [x] 5.5 Toggle visible and functional in mobile hamburger menu
