# Monthly Summary Email — Plan Brief

> Full plan: `context/changes/monthly-summary-email/plan.md`

## What & Why

Users want a month-end email overview showing what was paid (with amount mismatches highlighted), what was missed, and totals — so they can close out each month with a clear financial picture. The existing daily reminder system only nudges per-bill; this adds a whole-month snapshot that can also be triggered on-demand at any time.

## Starting Point

Pay Tracker already has SMTP email (en/pl/de), APScheduler running every 30 minutes, per-user notification preferences on the `User` model, and a "Send notification now" button in Settings. All patterns for extending this are established.

## Desired End State

A new `monthly_summary_enabled` toggle in Settings → Email Notifications. On the last day of each month, the existing 30-min scheduler automatically emails an HTML summary to eligible users, retrying on every run until it succeeds. A "Send monthly summary now" button lets users trigger the current month's report anytime (partial month is fine as a status snapshot).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Email format | HTML table | Multi-row summaries are unreadable in plain-text at 10+ bills | Plan |
| Report scope (on-demand) | Current month partial | User confirmed: useful as a status snapshot anytime | Plan |
| Idempotency | `monthly_summary_last_sent` (YYYY-MM) on User | Set only on success, provides natural retries without a counter | Plan |
| Retry behavior | Every 30-min scheduler run on last day | No dedicated retry infra; idempotency flag stops duplicate sends | Plan |
| Startup catch-up | Yes, include in `send_catchup_reminders()` | Zero gap risk if server restarts on the last day | Plan |
| Amount mismatch | Show both amounts in paid row | Consistent with payments UI mismatch warning; financially useful | Plan |
| Empty paid section | Send anyway, show upcoming only | Still useful: user sees what's still coming for the month | Plan |
| Manual send updates flag | Yes | Prevents the auto-send firing again later the same day | Plan |
| Tests | Extend existing test files | Idempotency logic is easy to break silently | Plan |

## Scope

**In scope:**
- `monthly_summary_enabled` user preference (toggle + API field)
- `monthly_summary_last_sent` idempotency field (backend-only)
- HTML summary email with Paid / Unpaid sections, mismatch highlight, en/pl/de
- Last-day-of-month auto-send (30-min scheduler, all eligible users, natural retries)
- Startup catch-up for missed summaries
- `POST /auth/send-monthly-summary-now` endpoint
- Settings page: toggle + "Send monthly summary now" button + translations

**Out of scope:**
- New APScheduler job
- Retry counter
- Month selection UI
- Changes to existing daily reminder emails

## Architecture / Approach

The feature piggybacks entirely on existing infrastructure. Two new fields on `User` (a `Boolean` pref and a `String(7)` idempotency tracker) drive behavior. The scheduler's `send_daily_reminders()` gains a last-day branch that queries ALL eligible users (not filtered by `reminder_send_minute`), so retries fire naturally on every 30-min tick. The HTML email uses stdlib `EmailMessage.add_alternative()` — no new dependencies. Frontend follows the exact existing pattern: `Switch` toggle, same dirty-tracking hooks, same button+result-state pattern as "Send notification now".

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data model + email template | New User fields, migration, schemas, `send_monthly_summary_email()` | Migration must include `DEFAULT TRUE` for existing users |
| 2. Service + scheduler + endpoint + tests | Full backend behavior, idempotency, retries, on-demand endpoint, test coverage | Idempotency logic subtle — scheduler must not filter by `reminder_send_minute` for summary users |
| 3. Frontend wiring | Toggle, button, translations in Settings | Dirty tracking must include new field to prevent nav-away data loss |

**Prerequisites:** SMTP configured in `.env`; Docker stack running  
**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- SMTP errors on the last day of month: the 30-min retry loop covers this, but if SMTP is down all day the summary is missed entirely (acceptable — same limitation as daily reminders)
- `monthly_summary_last_sent` is a string field (`YYYY-MM`) — if the user's timezone differs significantly from UTC, "last day of month" may fire a day early or late (same limitation as existing `reminder_send_minute` UTC assumption)

## Success Criteria (Summary)

- Toggle saved correctly; survives page refresh and language switch
- "Send monthly summary now" delivers a readable HTML email with correct paid/unpaid split and mismatch highlight
- Auto-send fires on the last day of month at the user's scheduled time, with no duplicate emails
