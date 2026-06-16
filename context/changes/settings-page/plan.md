# Settings Page Implementation Plan

## Overview

Add a dedicated Settings page at `/dashboard/settings` consolidating user profile management, email notification timing configuration, browser notifications, data backup, and restore. Clean up the overcrowded navigation header by moving four scattered toggle components into the new page; keep LanguageToggle and ThemeToggle in the header. Add a gear-icon link before the Logout button.

## Current State Analysis

The dashboard header (`frontend/src/app/dashboard/layout.tsx:86-101`) contains six icon-button components crammed into the right side: LanguageToggle, EmailRemindersToggle, NotificationToggle, BackupButton, RestoreButton, ThemeToggle. There is no settings page.

Email notification config is a single boolean (`users.email_reminders_enabled`). The reminder job (`backend/app/services/reminder_job.py`) fires once daily: queries users with `email_reminders_enabled=True`, sends "upcoming" (due tomorrow) and "overdue" (past due date, any days) emails.

No password-change or email-change endpoints exist. `PATCH /auth/me` currently only accepts `language_preference` and `email_reminders_enabled`.

### Key Discoveries

- `User` model at `backend/app/models/user.py:15-37` uses SQLAlchemy 2.0 `Mapped[T]` / `mapped_column()` style — all new columns must follow this pattern.
- `PaymentInstance` at `backend/app/models/bill.py:73-107` already has `reminder_sent_upcoming` and `reminder_sent_overdue` boolean flags. Two new flags are needed for the two new timing windows (2-days-before, on-day).
- Email service at `backend/app/services/email.py` uses `(is_overdue: bool, lang: str)` tuple keys for subject/body templates — four timing variants will require expanding to a `kind: str` key dimension.
- `useNotifications` hook at `frontend/src/hooks/useNotifications.ts` exposes `{ permission, requestPermission, notifyDueToday }`. The settings tile wraps this hook — no changes to the hook itself needed.
- `BackupButton` and `RestoreButton` already implement full dialog flows with `createPortal`. The settings page imports them directly.
- The mobile hamburger dropdown (`layout.tsx:118-154`) has its own copy of BackupButton, RestoreButton, and ThemeToggle in an icon row — these must also be removed.
- All UI text uses `next-intl` via `useTranslations`. Three locale files (`messages/en.json`, `pl.json`, `de.json`) must be updated.

## Desired End State

A Settings page accessible via a gear icon next to the Logout button in the nav header. The page renders five tile sections, each with its own Save/Cancel. The header contains only: nav links (Payments, Bills), LanguageToggle, ThemeToggle, gear-icon Settings link, LogOut. The email reminder job fires for each of the four user-configured timing windows, using per-instance sent flags to prevent duplicates.

### Key Discoveries

- Existing `reminder_sent_upcoming` maps to "1 day before"; `reminder_sent_overdue` can be reused as "1 day after" (query changes from `due_date < today` to `due_date == yesterday`).
- Migration default for new timing columns: `notify_1_day_before = True` preserves existing behavior for users who had `email_reminders_enabled = True`. All other new columns default `False`.
- `email_reminders_enabled` stays in the DB and schema output for now but is no longer writable via `UserProfileUpdate`. The reminder job switches to checking `any(notify_*)` implicitly by querying users where at least one notify flag is True.

## What We're NOT Doing

- Email verification flow for new email addresses.
- Timezone-aware reminder scheduling.
- Language / theme settings inside the Settings page (they stay in the nav header).
- "1 day after" as "any overdue" — it fires exactly once on the day after the due date.
- Unsubscribe links in reminder emails (the settings page is the management surface).
- Tests for reminder job edge cases beyond the existing test suite scope.

## Implementation Approach

Backend-first: model → migration → schema → endpoints → reminder job. Then frontend in two passes: data-layer + i18n first, then page + nav refactor. This order lets each phase be independently verifiable.

## Critical Implementation Details

- **Reminder job timing semantics change**: `reminder_sent_overdue` is repurposed from "any overdue" to "exactly 1 day after due date" (`due_date == today - 1`). This is a behavioral change for existing users — existing `reminder_sent_overdue = True` rows are unaffected (already flagged). New rows created after migration will only fire on the day-after-due window if `notify_1_day_after = True`.
- **`email_reminders_enabled` in reminder job**: After migration the job filters `users` where `User.notify_1_day_before.is_(True) | User.notify_2_days_before.is_(True) | User.notify_on_day.is_(True) | User.notify_1_day_after.is_(True)` instead of `email_reminders_enabled`. The `email_reminders_enabled` column stays in the DB and schema output but is not the active gate anymore.
- **Navigation guard (Next.js App Router)**: App Router does not expose `router.beforePopState`. Use the `beforeunload` browser event + intercept `<Link>` clicks via a wrapping context or `useRouter().push` wrapper. The simplest approach: track a `isDirty` boolean per section in local state and render an `<UnsavedChangesDialog>` modal via `createPortal` on navigation attempt, using the `beforeunload` event for browser-tab closure and an `onClick` guard on nav links.

---

## Phase 1: Backend — Model, Migration, Schema, Endpoints, Reminder Job

### Overview

Extend the User model with four notification timing flags, add two new reminder-sent flags to PaymentInstance, generate and apply the Alembic migration, update input/output schemas, add password-change and email-change endpoints, and rework the reminder job to dispatch per-timing-window emails.

### Changes Required

#### 1. User model timing columns

**File**: `backend/app/models/user.py`

**Intent**: Add four opt-in boolean columns controlling when reminder emails are sent, plus a preferred send hour. Default `notify_1_day_before = True` to preserve existing behavior; others default `False`. `reminder_send_hour` defaults to `8` (8 AM UTC).

**Contract**: Four `Mapped[bool]` columns + one `Mapped[int]` column:
- `notify_2_days_before`: `Boolean`, `default=False`, `server_default="false"`
- `notify_1_day_before`: `Boolean`, `default=True`, `server_default="true"`
- `notify_on_day`: `Boolean`, `default=False`, `server_default="false"`
- `notify_1_day_after`: `Boolean`, `default=False`, `server_default="false"`
- `reminder_send_hour`: `Integer`, `default=8`, `server_default="8"` (0–23 UTC hour)

#### 2. PaymentInstance new sent flags

**File**: `backend/app/models/bill.py`

**Intent**: Add two sent-flag columns for the two new timing windows that don't have existing flags.

**Contract**: Two `Mapped[bool]` columns following the existing pattern:
- `reminder_sent_2_days_before`: `Boolean`, `nullable=False`, `default=False`, `server_default="false"`
- `reminder_sent_on_day`: `Boolean`, `nullable=False`, `default=False`, `server_default="false"`

Note: `reminder_sent_upcoming` continues to serve "1 day before"; `reminder_sent_overdue` is reused for "1 day after".

#### 3. Alembic migration

**File**: new file under `backend/alembic/versions/`

**Intent**: Generate and verify the autogenerated migration for all six new columns (4 on users, 2 on payment_instances).

**Contract**: Run `docker compose exec backend uv run alembic revision --autogenerate -m "add_notification_timing_prefs"`. Inspect the generated file to confirm all six columns appear with correct `server_default` values before applying.

#### 4. Auth schemas — UserProfileOut and UserProfileUpdate

**File**: `backend/app/schemas/auth.py`

**Intent**: Expose the four timing flags in `UserProfileOut` so the frontend can read them. Add them as optional fields in `UserProfileUpdate` so the settings page can save them. Remove `email_reminders_enabled` from `UserProfileUpdate` (it's no longer user-settable; it remains in `UserProfileOut` for backward compat).

**Contract**:
- `UserProfileOut`: add `notify_2_days_before: bool`, `notify_1_day_before: bool`, `notify_on_day: bool`, `notify_1_day_after: bool`, `reminder_send_hour: int`
- `UserProfileUpdate`: add `notify_2_days_before: bool | None = None`, `notify_1_day_before: bool | None = None`, `notify_on_day: bool | None = None`, `notify_1_day_after: bool | None = None`, `reminder_send_hour: int | None = None`; remove `email_reminders_enabled` field

#### 5. Password-change endpoint

**File**: `backend/app/routers/auth.py`

**Intent**: Add a dedicated endpoint for changing the current user's password. Requires the current password to prevent session-hijack escalation.

**Contract**: `PATCH /auth/change-password` accepts `{ current_password: str, new_password: str }`. Verify `current_password` against `user.password_hash` using `verify_password`; raise HTTP 400 `"Current password is incorrect"` on mismatch. Validate `len(new_password) >= 8`; raise HTTP 422 if too short. Hash and store the new password. Returns 200 with no body (or the existing `UserProfileOut`).

Add a new Pydantic schema `ChangePasswordRequest(BaseModel)` in `schemas/auth.py` with `current_password: str` and `new_password: str`.

#### 6. Email-change endpoint

**File**: `backend/app/routers/auth.py`

**Intent**: Allow the user to change their login email, protected by current password verification.

**Contract**: `PATCH /auth/change-email` accepts `{ new_email: EmailStr, current_password: str }`. Verify `current_password`; raise HTTP 400 on mismatch. Check uniqueness of `new_email` in the users table; raise HTTP 400 `"Email already registered"` if taken. Update `user.email`. Returns `UserProfileOut`.

Add `ChangeEmailRequest(BaseModel)` in `schemas/auth.py`.

#### 7a. Scheduler — hourly cadence

**File**: `backend/app/main.py`

**Intent**: Switch from a fixed 8 AM daily cron to an hourly cron. The reminder job now filters users by their preferred send hour, so it must run every hour.

**Contract**: Change `hour=8, minute=0` to `minute=0` in `scheduler.add_job`. The startup one-shot call (`send_daily_reminders(SessionLocal)`) still runs on startup; it picks the current UTC hour automatically via `datetime.now(timezone.utc).hour`.

#### 7. Reminder job — four-window dispatch

**File**: `backend/app/services/reminder_job.py`

**Intent**: Replace the fixed "tomorrow + any-overdue" logic with four per-user timing windows. Only fire each window if the user has that flag set; use per-instance sent flags to prevent duplicate sends.

**Contract**:
- Change user filter to `User.reminder_send_hour == current_utc_hour AND (notify_* flags OR-chain)`.
- Accept optional `send_hour: int | None` parameter (defaults to `datetime.now(timezone.utc).hour`).
- Compute `two_days_out = today + timedelta(days=2)` and `yesterday = today - timedelta(days=1)`.
- For each user, conditionally query four instance sets:
  - `notify_2_days_before`: `due_date == two_days_out`, `reminder_sent_2_days_before=False`
  - `notify_1_day_before`: `due_date == tomorrow`, `reminder_sent_upcoming=False` (existing flag)
  - `notify_on_day`: `due_date == today`, `reminder_sent_on_day=False`
  - `notify_1_day_after`: `due_date == yesterday`, `reminder_sent_overdue=False` (existing flag, semantics tightened)
- Call `_send_and_flag` for each, passing a `kind: str` parameter ("2_days_before", "upcoming", "on_day", "1_day_after") instead of `is_overdue: bool`.

**Email service change (`backend/app/services/email.py`)**: Expand `_SUBJECTS` / `_BODIES` dict keys from `(bool, str)` to `(str, str)` where the first element is the `kind`. Add subject/body strings for "2_days_before" and "on_day" in all three languages. Rename the "upcoming" and "overdue" entries to use kind strings.

### Success Criteria

#### Automated Verification

- `docker compose exec backend uv run alembic upgrade head` runs cleanly with the new migration
- `docker compose exec backend uv run pytest tests/ -x` passes (existing test suite)
- `docker compose exec backend uv run ruff check app/` passes

#### Manual Verification

- `GET /auth/me` response includes all four `notify_*` fields
- `PATCH /auth/me` with `{ "notify_2_days_before": true }` updates the field; other fields unchanged
- `PATCH /auth/change-password` with correct current password succeeds; wrong current password returns 400
- `PATCH /auth/change-email` with taken email returns 400; with unique email updates profile
- Swagger docs at `http://localhost:8010/docs` show all new endpoints correctly

---

## Phase 2: Frontend Data Layer & i18n

### Overview

Update the TypeScript user API layer to expose new endpoints and schema fields. Add all Settings page translation keys to the three locale files before building the UI so the page can use `useTranslations` from the start.

### Changes Required

#### 1. UserProfile interface and new API functions

**File**: `frontend/src/lib/user-api.ts`

**Intent**: Add the four timing fields to `UserProfile` and expose `changePassword` and `changeEmail` as typed functions matching the new backend endpoints.

**Contract**:
- `UserProfile` interface: add `notify_2_days_before: boolean`, `notify_1_day_before: boolean`, `notify_on_day: boolean`, `notify_1_day_after: boolean`, `reminder_send_hour: number`. Remove `email_reminders_enabled` from the `Partial<Pick<...>>` union in `updateMe` (it is no longer patchable).
- `changePassword(currentPassword: string, newPassword: string): Promise<void>` — PATCH `/auth/change-password`, throws on non-2xx.
- `changeEmail(newEmail: string, currentPassword: string): Promise<UserProfile>` — PATCH `/auth/change-email`, returns updated profile.

#### 2. Settings page translations — English

**File**: `frontend/messages/en.json`

**Intent**: Add a `SettingsPage` key block for all text used on the settings page and in the nav gear icon.

**Contract**: Add the following key block (exact keys; translations must be accurate English):
```json
"SettingsPage": {
  "navLabel": "Settings",
  "pageTitle": "Settings",
  "unsavedTitle": "Unsaved changes",
  "unsavedDescription": "You have unsaved changes. Leave without saving?",
  "unsavedLeave": "Leave",
  "unsavedStay": "Stay",
  "save": "Save",
  "saving": "Saving…",
  "cancel": "Cancel",
  "saveFailed": "Save failed. Please try again.",
  "profile": {
    "title": "User Profile",
    "description": "Update your login email and password.",
    "emailLabel": "Email address",
    "emailPlaceholder": "new@email.com",
    "currentPasswordLabel": "Current password",
    "currentPasswordPlaceholder": "Enter current password",
    "newPasswordLabel": "New password",
    "newPasswordPlaceholder": "Minimum 8 characters",
    "passwordTooShort": "Password must be at least 8 characters.",
    "wrongPassword": "Current password is incorrect.",
    "emailTaken": "That email is already registered."
  },
  "emailNotifications": {
    "title": "Email Notifications",
    "description": "Choose when to receive email reminders for upcoming and overdue bills.",
    "twoDaysBefore": "2 days before due date",
    "oneDayBefore": "1 day before due date",
    "onDay": "On the payment date",
    "oneDayAfter": "1 day after due date",
    "noneWarning": "Select at least one option to receive email reminders.",
    "sendTimeLabel": "Send time (UTC)",
    "sendTimePlaceholder": "Select hour"
  },
  "browserNotifications": {
    "title": "Browser Notifications",
    "description": "Get notified when a bill is due today.",
    "enable": "Enable notifications",
    "enabled": "Notifications enabled",
    "blockedWarning": "Browser notifications are blocked. Enable them in your browser or operating system settings.",
    "requestFailed": "Could not request notification permission."
  },
  "backup": {
    "title": "Backup Data",
    "description": "Download a complete copy of all your Pay Tracker data as a JSON file."
  },
  "restore": {
    "title": "Restore Data",
    "description": "Replace all current data with a previously downloaded backup file."
  }
}
```

Also add `"settings": "Settings"` to `DashboardLayout` key block.

#### 3. Settings page translations — Polish

**File**: `frontend/messages/pl.json`

**Intent**: Add the Polish equivalent of the SettingsPage key block.

**Contract**: Mirror the same key structure with accurate Polish translations. Add `"settings": "Ustawienia"` to `DashboardLayout`.

#### 4. Settings page translations — German

**File**: `frontend/messages/de.json`

**Intent**: Add the German equivalent of the SettingsPage key block.

**Contract**: Mirror the same key structure with accurate German translations. Add `"settings": "Einstellungen"` to `DashboardLayout`.

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes with no errors
- `cd frontend && npm run build` passes (type-check included in build)

#### Manual Verification

- All three locale files contain the `SettingsPage` key block with no missing keys

---

## Phase 3: Settings Page

### Overview

Create the settings page at `app/dashboard/settings/page.tsx` with five tile sections. Each tile has its own local state, Save/Cancel buttons, and save error handling. A dirty-state tracker and navigation confirmation dialog prevent accidental loss of unsaved edits.

### Changes Required

#### 1. Settings page component

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Render the five settings tiles in order: User Profile (blue), Email Notifications (yellow), Browser Notifications (yellow), Backup (red), Restore (red). Page-level: load the current profile on mount via `fetchMe`, pass data down to each tile.

**Contract**: Client component (`"use client"`). Fetch user profile with `fetchMe()` on mount; show a loading skeleton while pending. Pass `profile` and `onProfileUpdate` callback to child tiles. Render tiles in a single-column `max-w-2xl` layout matching the app's existing page padding pattern.

#### 2. Tile base structure

**File**: `frontend/src/app/dashboard/settings/page.tsx` (inline or extracted to `frontend/src/components/settings/SettingsTile.tsx`)

**Intent**: Each tile is a rounded card with: colored left-border accent (blue/yellow/red), icon + title row, description line, feature-specific content area, and a Save/Cancel footer (conditionally shown when `isDirty`).

**Contract**: Color mapping — profile: `border-blue-400` / `bg-blue-50`, notifications (email + browser): `border-yellow-400` / `bg-yellow-50`, backup + restore: `border-red-400` / `bg-red-50`. Dark-mode variants should follow the pattern of existing cards in the app. Each tile manages its own `isDirty` boolean and `isSaving` state.

#### 3. User Profile tile

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Show the current email (read-only display). Provide an email-change form (new email + current password) and a password-change form (current password + new password). Each sub-form has its own inline error state. Submitting either triggers the corresponding API call.

**Contract**: 
- Email-change calls `changeEmail(newEmail, currentPassword)` → on 400 "Email already registered" show `t("profile.emailTaken")`; on 400 "Current password is incorrect" show `t("profile.wrongPassword")`.
- Password-change calls `changePassword(currentPassword, newPassword)` → on 400 "Current password is incorrect" show `t("profile.wrongPassword")`; validate `newPassword.length >= 8` client-side first.
- Tile is dirty when either sub-form has non-empty input. Cancel clears all inputs.

#### 4. Email Notifications tile

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Four independent checkboxes for timing options plus a send-time dropdown (hour 0–23 UTC), all populated from `profile`. Save calls `updateMe({ notify_2_days_before, notify_1_day_before, notify_on_day, notify_1_day_after, reminder_send_hour })`. Show an inline warning when no checkbox is checked.

**Contract**: Local checkbox + hour state initialized from `profile`. Dirty when local state differs from profile. Cancel resets to profile values. When all four checkboxes are unchecked, render a yellow warning: `t("emailNotifications.noneWarning")`. The send-time dropdown renders 24 options "00:00"–"23:00" mapped to integers 0–23.

#### 5. Browser Notifications tile

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Show current permission state with appropriate UI. When `denied`, show the amber warning banner and a disabled button. When `default`, show an enable button. When `granted`, show a "notifications enabled" state. No Save/Cancel needed — permission request is immediate.

**Contract**: Uses `useNotifications()` hook. When `permission === "denied"`: render an amber `<div>` with warning icon and `t("browserNotifications.blockedWarning")`, button disabled with `cursor-not-allowed`. No dirty state / Save/Cancel for this tile.

#### 6. Backup tile

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Display the description sentence and render the existing `<BackupButton />` component. No Save/Cancel.

**Contract**: Import `BackupButton` from `@/components/BackupButton`. The tile body is `<p>{t("backup.description")}</p>` followed by `<BackupButton />` (the button renders its own confirm dialog via portal).

#### 7. Restore tile

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Same pattern as backup — description + `<RestoreButton />`.

**Contract**: Import `RestoreButton` from `@/components/RestoreButton`.

#### 8. Navigation guard

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Prevent accidental navigation away when any tile has unsaved changes.

**Contract**:
- Track a page-level `isDirtyAny` boolean (`true` when any tile's `isDirty` is true).
- On mount, register a `beforeunload` event listener that calls `e.preventDefault()` when `isDirtyAny` is true (browser tab close / refresh guard).
- For in-app navigation: wrap `<Link>` clicks in an `onClick` that checks `isDirtyAny` and opens an `<UnsavedChangesDialog>` portal instead of navigating. The dialog shows `t("unsavedDescription")` with Leave / Stay buttons.

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes
- `cd frontend && npm run build` passes

#### Manual Verification

- Navigating to `/dashboard/settings` renders all 5 tiles with correct colors
- Changing a checkbox in Email Notifications marks that tile as dirty; Save/Cancel appear
- Clicking Cancel resets checkboxes to their original values
- Clicking Save on Email Notifications persists changes (verify via `GET /auth/me` response)
- Changing password with wrong current password shows inline error
- Changing password with new password < 8 chars shows client-side error
- Changing email to already-taken email shows inline error
- When browser notifications are denied (set via browser settings), the blocked warning banner is visible
- With unsaved changes, clicking a nav link opens the confirmation dialog
- With unsaved changes, refreshing the browser triggers the browser's native unsaved-changes warning
- Page works correctly with pl and de locale selected

---

## Phase 4: Nav Refactor

### Overview

Add a gear-icon Settings link to the header (before Logout), remove the four components that moved into the settings page, and update the mobile hamburger dropdown to match.

### Changes Required

#### 1. Desktop header — add Settings button, remove four components

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Replace the crowded right-side icon cluster with the slimmed-down set: LanguageToggle, ThemeToggle, gear-icon Settings link, LogOut button.

**Contract**:
- Remove imports of `EmailRemindersToggle`, `NotificationToggle`, `BackupButton`, `RestoreButton`.
- Add `Settings` from `lucide-react` to the icon import.
- In the desktop right-side `<div>` (lines 86-101): remove `<EmailRemindersToggle />`, `<NotificationToggle />`, `<BackupButton />`, `<RestoreButton />`. Keep `<LanguageToggle />` and `<ThemeToggle />`.
- Add a `<Link href="/dashboard/settings" ...>` with `<Settings size={15} />` and `{t("settings")}` label, styled identically to the Logout button (same `className`), positioned between ThemeToggle and LogOut.
- Apply active state to the Settings link when `pathname === "/dashboard/settings"` (matching the existing active-state pattern used for nav items).

#### 2. Mobile header — icon row cleanup

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Remove EmailRemindersToggle and NotificationToggle from the mobile icon row (lines 104-116).

**Contract**: The mobile icon row currently shows `<LanguageToggle />`, `<EmailRemindersToggle />`, `<NotificationToggle />`, hamburger button. Remove `<EmailRemindersToggle />` and `<NotificationToggle />`. Keep `<LanguageToggle />` and the hamburger.

#### 3. Mobile dropdown — add Settings, remove BackupButton / RestoreButton

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Remove BackupButton and RestoreButton from the mobile dropdown footer row. Add Settings as a nav link in the NAV_ITEMS-generated list.

**Contract**:
- Add `{ href: "/dashboard/settings", labelKey: "settings" as const, icon: Settings }` to `NAV_ITEMS` array — this makes it appear in both desktop nav and mobile dropdown automatically.
- In the mobile dropdown footer row (lines 140-151): remove `<BackupButton />` and `<RestoreButton />`. Keep `<ThemeToggle />` and the LogOut button.
- Remove the now-unused `BackupButton` and `RestoreButton` imports from the file.

**Note**: Adding Settings to `NAV_ITEMS` means it also appears in the desktop nav list (alongside Payments and Bills). If the user's preference is Settings only as an icon button (not a text nav link in the main nav), extract it as a separate list entry rendered only in mobile dropdown. Revisit if the user requests this distinction.

#### 4. DashboardLayout i18n key

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: The `useTranslations("DashboardLayout")` call must cover the `"settings"` key added in Phase 2.

**Contract**: No code change needed here — the key is already added to the locale files in Phase 2. Verify `t("settings")` resolves correctly after locale file update.

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes (no unused imports)
- `cd frontend && npm run build` passes

#### Manual Verification

- Desktop header shows: nav links (Payments, Bills, Settings), LanguageToggle, ThemeToggle, gear-icon Settings link, LogOut button — no other icon buttons
- Mobile hamburger dropdown shows: Payments, Bills, Settings nav links; ThemeToggle + LogOut in footer row
- Mobile icon row shows: LanguageToggle + hamburger only
- Clicking the Settings link navigates to `/dashboard/settings`
- Settings nav link shows active state (indigo highlight) when on the settings page
- No console errors about missing imports

---

## Testing Strategy

### Unit Tests

- Backend: `tests/test_auth.py` — add cases for `PATCH /auth/change-password` (correct current password, wrong current password, too-short new password) and `PATCH /auth/change-email` (success, wrong password, taken email).
- Backend: `tests/test_reminder_job.py` — add cases for each of the four timing windows; verify only the window matching the user's flag fires.

### Integration Tests

- End-to-end: navigate to settings, change email notification preferences, save, reload page — verify persisted.
- End-to-end: change password, log out, log in with new password.

### Manual Testing Steps

1. Run `docker compose up --build`; navigate to `/dashboard/settings`
2. Verify all 5 tiles render with correct colors (blue, yellow, yellow, red, red)
3. Toggle email notification checkboxes; save; reload — verify state persisted
4. Attempt to uncheck all 4 email notification checkboxes — verify warning appears
5. Change email to an already-registered email — verify 400 error message
6. Change password with wrong current password — verify error
7. Change password with valid current password and new ≥8-char password — log out, log in with new password
8. Open browser notification settings → block — reload settings → verify blocked warning banner
9. Click nav link with unsaved changes — verify confirmation dialog
10. Close browser tab with unsaved changes — verify browser's native dialog fires
11. Switch locale to `pl` and `de` — verify all settings page text is translated

## Migration Notes

The Alembic migration sets `server_default="true"` for `notify_1_day_before` on the users table so existing rows opt into this timing automatically, preserving the pre-migration reminder behavior. All other new columns default `False`.

After the migration, `email_reminders_enabled` remains in the users table and in `UserProfileOut` but is no longer the active gate in the reminder job. It is kept for schema backward compatibility and can be dropped in a future cleanup migration.

## References

- Dashboard layout: `frontend/src/app/dashboard/layout.tsx`
- User model: `backend/app/models/user.py`
- PaymentInstance model: `backend/app/models/bill.py:73-107`
- Auth router: `backend/app/routers/auth.py`
- Auth schemas: `backend/app/schemas/auth.py`
- Reminder job: `backend/app/services/reminder_job.py`
- Email service: `backend/app/services/email.py`
- user-api: `frontend/src/lib/user-api.ts`
- useNotifications hook: `frontend/src/hooks/useNotifications.ts`
- Locale files: `frontend/messages/en.json`, `pl.json`, `de.json`
- BackupButton: `frontend/src/components/BackupButton.tsx`
- RestoreButton: `frontend/src/components/RestoreButton.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — Model, Migration, Schema, Endpoints, Reminder Job

#### Automated

- [x] 1.1 `alembic upgrade head` applies cleanly with new migration
- [x] 1.2 `pytest tests/ -x` passes
- [x] 1.3 `ruff check app/` passes

#### Manual

- [x] 1.4 `GET /auth/me` returns all four `notify_*` fields
- [x] 1.5 `PATCH /auth/me` updates timing fields correctly
- [x] 1.6 `PATCH /auth/change-password` — correct password succeeds, wrong password returns 400
- [x] 1.7 `PATCH /auth/change-email` — taken email returns 400, unique email updates profile
- [x] 1.8 Swagger docs show all new endpoints

### Phase 2: Frontend Data Layer & i18n

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 `npm run build` passes

#### Manual

- [x] 2.3 All three locale files contain the `SettingsPage` key block with no missing keys

### Phase 3: Settings Page

#### Automated

- [x] 3.1 `npm run lint` passes
- [x] 3.2 `npm run build` passes

#### Manual

- [x] 3.3 All 5 tiles render with correct colors on `/dashboard/settings`
- [x] 3.4 Email notification checkboxes persist on save and reload
- [x] 3.5 Uncheck all email checkboxes — warning banner appears
- [x] 3.6 Email change — taken email shows inline error
- [x] 3.7 Password change — wrong current password shows inline error
- [x] 3.8 Browser notifications blocked — warning banner visible in tile
- [x] 3.9 Nav link click with unsaved changes — confirmation dialog appears
- [x] 3.10 Browser tab close with unsaved changes — native browser dialog fires
- [x] 3.11 Page text is correct in pl and de locales

### Phase 4: Nav Refactor

#### Automated

- [x] 4.1 `npm run lint` passes (no unused imports)
- [x] 4.2 `npm run build` passes

#### Manual

- [x] 4.3 Desktop header shows only: nav links, LanguageToggle, ThemeToggle, Settings, LogOut
- [x] 4.4 Mobile hamburger dropdown shows Settings as a nav link
- [x] 4.5 Mobile icon row shows only LanguageToggle + hamburger
- [x] 4.6 Settings link shows active state when on `/dashboard/settings`
- [x] 4.7 No console errors about missing imports
