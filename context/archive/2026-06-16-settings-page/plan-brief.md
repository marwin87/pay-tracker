# Settings Page — Plan Brief

> Full plan: `context/changes/settings-page/plan.md`

## What & Why

Add a dedicated Settings page consolidating five scattered features (email reminders, browser notifications, backup, restore, and user profile management) that currently live as icon buttons crammed into the navigation header. The header will be cleaned up to show only navigation links, LanguageToggle, ThemeToggle, a gear-icon Settings link, and Logout.

## Starting Point

The dashboard header (`frontend/src/app/dashboard/layout.tsx:86-101`) contains six icon-button components alongside the Logout button. Email notifications are controlled by a single boolean (`email_reminders_enabled`) with no per-timing granularity. No password-change or email-change endpoints exist on the backend.

## Desired End State

A `/dashboard/settings` page with five tile sections (blue: profile, yellow: email & browser notifications, red: backup & restore), each with its own Save/Cancel. Email reminders have four configurable timing options (2 days before, 1 day before, on day, 1 day after) backed by real backend logic. Users can change their email or password from the profile tile. The navigation header is decluttered.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Nav entry for Settings | Gear icon button before Logout | Compact; added to NAV_ITEMS for mobile dropdown auto-inclusion |
| Header cleanup scope | Remove Email/Notif/Backup/Restore; keep Lang/Theme | Lang and Theme are quick-access preferences not needing a full page |
| Email timing | Full 4-option implementation (DB + reminder job) | Storing prefs without wiring them would be misleading to users |
| Master email toggle | Replaced by checkbox group (at least one = enabled) | Simpler mental model; `email_reminders_enabled` becomes legacy |
| Password change security | Requires current password | Standard practice to prevent session-hijack escalation |
| Email change security | New email + current password | Reasonable security without email verification infrastructure |
| Unsaved navigation | Confirmation dialog | Prevents accidental loss of partially-entered passwords |
| i18n | Full en/pl/de from day one | Consistent with every other page in the app |

## Scope

**In scope:**
- New `/dashboard/settings` page with 5 tiles
- 4 new User model columns (`notify_*`) + Alembic migration
- 2 new PaymentInstance columns (`reminder_sent_2_days_before`, `reminder_sent_on_day`)
- Updated reminder job handling all 4 timing windows
- New endpoints: `PATCH /auth/change-password`, `PATCH /auth/change-email`
- Nav header refactor (remove 4 components, add Settings link)
- Translation keys in all 3 locale files

**Out of scope:**
- Email verification for new email address
- Timezone-aware reminder scheduling
- Language / theme settings inside the Settings page
- "Any overdue" semantics — 1-day-after fires exactly once on the day after due date
- Unsubscribe links in reminder emails

## Architecture / Approach

Backend-first: extend model → generate migration → update schemas → add endpoints → refactor reminder job. Then frontend in two passes: data layer + i18n keys first, then the page itself + nav refactor. The BackupButton and RestoreButton components are reused as-is inside the settings tiles — no changes to those components needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend | 4 timing columns, 2 PI flags, migration, new endpoints, reminder job update | Reminder job semantics change for `reminder_sent_overdue` (now "exactly 1 day after" not "any overdue") |
| 2. Data layer & i18n | Updated user-api.ts, SettingsPage keys in 3 locale files | Missing translation keys cause build errors |
| 3. Settings page | Full 5-tile page with dirty state + nav guard | Navigation guard complexity in App Router (no beforePopState) |
| 4. Nav refactor | Gear icon in header, remove 4 components, mobile update | Accidental removal of ThemeToggle or LanguageToggle |

**Prerequisites:** Docker running with clean DB; SMTP configured for reminder job testing  
**Estimated effort:** ~3-4 sessions across 4 phases

## Open Risks & Assumptions

- `email_reminders_enabled` stays in DB as a legacy column after migration — it is no longer the active gate in the reminder job. A future cleanup migration can drop it.
- Adding Settings to `NAV_ITEMS` makes it appear as a text link in the desktop nav bar (alongside Payments and Bills) — this may need adjustment if the user wants it only as an icon button.
- The navigation guard for in-app links requires intercepting `<Link>` `onClick` events; the `beforeunload` event covers browser tab close. App Router has no `router.beforePopState` equivalent.

## Success Criteria (Summary)

- `/dashboard/settings` renders all 5 tiles with correct color coding and all sections functional
- Email reminder job fires per-user per configured timing window with no duplicates
- Password and email change work end-to-end with correct error messages
- Header is clean: only nav links, LanguageToggle, ThemeToggle, Settings gear, LogOut
