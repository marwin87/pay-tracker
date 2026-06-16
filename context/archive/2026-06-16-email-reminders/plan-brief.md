# Email Reminders — Plan Brief

> Full plan: `context/changes/email-reminders/plan.md`

## What & Why

Implement FR-012: the system sends email reminders to users before and after payment due dates. This is the last nice-to-have feature in the PRD — all must-haves are shipped. The goal is to reduce missed payments without requiring the user to check the app daily.

## Starting Point

SMTP config stubs already exist in `backend/app/core/config.py` (lines 13–18) and the `User` model has an `email` field, but no scheduler, email service, or reminder state tracking exists. PaymentInstance has `due_date` and `status` — everything needed to detect what needs reminding.

## Desired End State

When SMTP is configured, each user receives a plain-text email 1 day before a payment is due and another on the first day it becomes overdue (if still unpaid). Each email is sent exactly once. Users can disable reminders via a bell-icon toggle in the dashboard header. Backups capture reminder state so a restore doesn't re-send already-delivered emails.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Reminder windows | Day-before + first overdue day | Two chances to act; mirrors common billing app behavior |
| Idempotency | `reminder_sent_upcoming` + `reminder_sent_overdue` flags on PaymentInstance | Co-located with payment data; no extra table; simple query |
| Email language | Follows `user.language_preference` (en/pl/de) | Consistent with existing i18n (FR-016); no extra input needed |
| Email format | Plain text, per-payment (not digest) | No HTML complexity; straightforward state per instance |
| Opt-out | `email_reminders_enabled` boolean on User, toggled in UI | Simpler than unsubscribe links; appropriate for private household app |
| Scheduler | APScheduler embedded in FastAPI lifespan | No extra infra; roadmap already recommends this for household scale |
| SMTP absent | Log warning, skip — app starts cleanly | Dev/test environments have no SMTP; must not crash on startup |
| Backup compat | Include flags in v3 backup; v2 restores default to False | Worst case: one extra reminder email after restore from v2 backup |

## Scope

**In scope:**
- DB columns for reminder tracking (`payment_instances`) and opt-out (`users`)
- APScheduler daily job (08:00 UTC) with per-user, per-instance reminder logic
- `backend/app/services/email.py` — plain-text email with en/pl/de templates
- Auth profile API extension (`email_reminders_enabled` read/write)
- Backup schema v3 (reminder flags included); restore accepts v2 and v3
- Frontend bell-icon toggle in dashboard header (desktop + mobile)

**Out of scope:**
- HTML emails
- Per-bill reminder preferences
- One-click unsubscribe links
- Configurable timing per user
- Retry queues / Celery / Redis

## Architecture / Approach

APScheduler's `AsyncIOScheduler` is registered in FastAPI's lifespan context manager (`main.py`). At 08:00 UTC it dispatches `send_daily_reminders()` (sync) via `run_in_executor`. The job checks SMTP config first, then queries all opted-in users and their instances in two windows (upcoming: `due_date = today+1`; overdue: `due_date < today AND status != paid`). For each match it calls `send_reminder_email()` (new `email.py` module, stdlib `smtplib`), then flips the sent flag on success. SMTP failure leaves the flag unset so tomorrow's run retries.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data Model + Migration | 3 new DB columns + Alembic migration | `server_default` required or migration fails on live DB with existing rows |
| 2. Backend Schema + API | Profile opt-out field; backup v3; restore compat | Restore must accept both v2 and v3 without 422 |
| 3. Email Service | `email.py` pure function; 6 language × type templates | STARTTLS config differences between providers |
| 4. Scheduler + Wiring | APScheduler job + FastAPI lifespan | Overdue detection must use `due_date < today`, not `status == overdue` (computed field) |
| 5. Frontend Toggle | Bell-icon toggle; i18n keys; layout wiring | `fetchMe()` call on mount adds one extra API request per page load |

**Prerequisites:** Docker running, SMTP credentials available for manual testing (Mailtrap or real provider).
**Estimated effort:** ~2 sessions across 5 phases.

## Open Risks & Assumptions

- If the FastAPI process restarts mid-day, APScheduler resets — reminders already sent that day won't re-send (flags are set), but the job won't re-run until 08:00 the next day. Acceptable at household scale.
- `smtplib` always uses STARTTLS on port 587. If the configured SMTP provider requires implicit SSL (port 465), the service module will need a port-based branch.

## Success Criteria (Summary)

- Email arrives in the user's inbox 1 day before a due date, in their configured language.
- Overdue email arrives on the first day past due (if still unpaid).
- Disabling the toggle via the UI stops all future reminder emails.
