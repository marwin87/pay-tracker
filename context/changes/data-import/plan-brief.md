# Data Restore from Backup — Plan Brief

> Full plan: `context/changes/data-import/plan.md`

## What & Why

Add a restore feature so users can upload a Pay Tracker backup JSON and replace
all database content with the snapshot. Two scenarios need to work: a fresh
install with an empty database (user can't log in yet, so restore must be
unauthenticated) and a live instance where a logged-in user wants to restore at
any time.

## Starting Point

The backend has no restore endpoint and no setup-status check. The frontend root
unconditionally redirects to `/login` — there is no setup page, and the login
page has no awareness of whether the app has been initialized. The backup format
(JSON, `schema_version: 1`) is defined by the `data-backup` change.

## Desired End State

Fresh install: visiting `/login` auto-detects an empty DB and redirects to
`/setup`, which offers a two-card choice — "Start Fresh → Register" or "Restore
Backup" (file picker). Uploading a valid backup restores the DB and sends the
user to `/login` to sign in with restored credentials.

Live instance: a RestoreButton (upload icon) sits in the dashboard nav next to
BackupButton. Clicking it opens a dialog with a file picker, a warning about
data replacement, and a confirmation checkbox. After restore the session is
cleared and the user is redirected to `/login`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Restore access | Both unauthenticated (fresh) and authenticated (anytime) | Fresh install has no users to authenticate with; live restore needs no special mode |
| Restore strategy | Wipe then restore (not merge) | Merge requires ID conflict resolution; wipe+restore is deterministic and correct for a full snapshot |
| Session handling | Frontend calls `logout()` after restore | JWT secret rotation is overkill; the user re-logins immediately anyway |
| Setup detection | Login page checks `GET /restore/setup-status` on mount | Zero change to root redirect; follows existing client-side auth-check pattern |
| Setup page UI | Two-card layout (Register \| Restore) | Both paths are equally visible; avoids burying restore behind a tab |
| Confirmation guard | Checkbox + warning (not type-to-confirm) | Prevents accidental clicks without being annoying for a household admin |
| schema_version mismatch | Hard reject (422) | Never silently import from an incompatible format |
| Router filename | `restore.py` (not `import.py`) | `import` is a Python reserved keyword |

## Scope

**In scope:** `GET /restore/setup-status`, `POST /restore/setup` (unauth, gated),
`POST /restore` (auth), `/setup` frontend page, login page setup-check,
RestoreButton component, nav wiring, EN/PL/DE translations.

**Out of scope:** Merge/upsert restore, selective restore by table, pre-restore
auto-backup, import from `.xlsx`, scheduled or server-side backup storage.

## Architecture / Approach

**Backend:** Single new router `restore.py` with three endpoints sharing a
private `_execute_restore(db, payload)` helper. The helper validates
`schema_version`, deletes in FK order (payment_instances → bill_templates →
users), inserts in FK order (users → bill_templates → payment_instances), then
resets PostgreSQL sequences with `setval(..., COALESCE(MAX(id), 0) + 1, false)`
— all inside one transaction.

**Frontend (setup flow):** `import-api.ts` gets `checkSetupStatus()` and
`restoreFromSetup(file)`. Login page gains a silent mount-time redirect. New
`/setup` page guards itself (redirects to `/login` if no setup needed).

**Frontend (live restore):** `RestoreButton.tsx` self-contained component with
dialog. `import-api.ts` gets `restoreAuthenticated(file)` using the existing
auth cookie pattern. `dashboard/layout.tsx` inserts the button between
BackupButton and ThemeToggle.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend | Three endpoints + wipe/restore/sequence-reset logic | FK deletion order and sequence reset are non-obvious; first raw SQL in codebase |
| 2. Frontend setup page | Fresh-install restore flow | Login page check must not block rendering; setup page guard must not loop |
| 3. Frontend RestoreButton | Anytime restore for logged-in users | `logout()` must fire after success, not on error |

**Prerequisites:** `data-backup` plan implemented (backup format must exist);
Docker running (`docker compose up --build`)  
**Estimated effort:** ~1-2 sessions across 3 phases

## Open Risks & Assumptions

- `HardDriveUpload` icon must exist in the installed lucide-react version; fall
  back to `Upload` if not found
- PostgreSQL sequence names follow the default pattern `<table>_id_seq`; if
  Alembic created them with explicit names these must be verified before the
  sequence reset SQL is written
- Any logged-in user can restore (wiping all other users' data) — appropriate
  for a single-household deployment where all users are trusted

## Success Criteria (Summary)

- Fresh install with an empty DB: `/login` redirects to `/setup`; uploading a
  valid backup restores data and allows login with restored credentials
- Live instance: RestoreButton in nav opens dialog; valid backup wipes and
  restores data; user is logged out and can re-login with restored credentials
- Invalid backup (wrong version or malformed) → clear error message; no data
  changed
