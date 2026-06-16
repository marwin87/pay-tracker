<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Settings Page

- **Plan**: context/changes/settings-page/plan.md
- **Scope**: All Phases (1–4)
- **Date**: 2026-06-16
- **Verdict**: REJECTED → FIXED (all critical/warnings resolved during triage)
- **Findings**: 1 critical · 5 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — email_reminders_enabled master toggle ignored by scheduler

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/reminder_job.py:80–91
- **Detail**: send_daily_reminders filtered users by is_active, reminder_send_hour, and notify_* flags but never by email_reminders_enabled. Users who opted out still received all scheduled reminders.
- **Fix Applied**: Fix A — Added `User.email_reminders_enabled.is_(True)` to the scheduler user filter. Added `email_reminders_enabled: bool | None = None` to `UserProfileUpdate` (backend schema). Added `"email_reminders_enabled"` to `updateMe` Pick in user-api.ts. Roadmap TODO added for the settings page master toggle UI.
- **Decision**: FIXED

### F2 — Soft-deleted PaymentInstance rows not excluded from reminders

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/reminder_job.py:44–54
- **Detail**: Instance query did not filter on `PaymentInstance.is_deleted == False`. Soft-deleted (user-dismissed) instances could trigger reminder emails.
- **Fix Applied**: Added `.filter(PaymentInstance.is_deleted.is_(False))` to the instance query in `send_reminders_for_user`.
- **Decision**: FIXED

### F3 — Paused / archived BillTemplate rows still trigger reminders

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/reminder_job.py:23–27
- **Detail**: template_ids collected all BillTemplate rows for the user without filtering `is_archived` or `is_paused`. Payment instances for paused/archived bills still fired reminders.
- **Fix Applied**: Added `.filter(BillTemplate.is_archived.is_(False), BillTemplate.is_paused.is_(False))` to template collection query.
- **Decision**: FIXED

### F4 — reminder_send_hour accepts out-of-range integers (no 0–23 validation)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/schemas/auth.py:40
- **Detail**: `UserProfileUpdate.reminder_send_hour: int | None = None` had no range constraint. A client could PATCH with -1 or 99, storing garbage that makes reminders silently stop firing.
- **Fix Applied**: Changed to `Annotated[int, Field(ge=0, le=23)] | None = None`. Added `Annotated` and `Field` imports.
- **Decision**: FIXED

### F5 — Email change form lacks client-side guard for partial input

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/app/dashboard/settings/page.tsx:155–195
- **Detail**: Email change and password change were coupled in a single save() with misleading error paths when only one field was filled.
- **Fix Applied**: Refactored ProfileTile into two fully independent sub-forms (email change + password change), each with their own state, save function, and inline Save/Cancel buttons. Added `emailAndPasswordRequired` guard in saveEmail(). Added the new translation key to en.json, pl.json, de.json.
- **Decision**: FIXED

### F6 — email_reminders_enabled in UserProfileOut but not writable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: backend/app/schemas/auth.py:26 + 34–42
- **Detail**: email_reminders_enabled shown in output but absent from UserProfileUpdate. Resolved by F1 Fix A (backend now wired). Settings page master toggle UI is a follow-up tracked in roadmap.md.
- **Decision**: ACCEPTED — backend wired by F1; UI toggle is roadmap follow-up

### F7 — Settings not in NAV_ITEMS array (plan drift)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/app/dashboard/layout.tsx:13–16
- **Detail**: Settings was hard-coded separately in desktop header and appended via spread in mobile dropdown, rather than being in NAV_ITEMS.
- **Fix Applied**: Added `{ href: "/dashboard/settings", labelKey: "settings", icon: Settings }` to NAV_ITEMS. Removed hard-coded desktop right-side Settings Link. Removed spread `[...NAV_ITEMS, ...]` from mobile dropdown.
- **Decision**: FIXED

### F8 — Short-password returns 422 instead of planned 400

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: backend/app/routers/auth.py:~73
- **Detail**: Plan specified 400 for short new_password; implementation returns 422 (semantically correct for validation). Frontend validates client-side first so no functional impact.
- **Decision**: ACCEPTED — 422 is the correct HTTP status for validation errors

### F9 — Startup-time reminder call blocks lifespan before first request

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/main.py:26
- **Detail**: `send_daily_reminders(SessionLocal)` ran synchronously inside async lifespan before yield. SMTP unavailability on startup stalled container readiness.
- **Fix Applied**: Fix B — Changed to `loop.run_in_executor(None, send_daily_reminders, SessionLocal)`. Added `import asyncio`.
- **Decision**: FIXED
