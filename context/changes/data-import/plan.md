# Data Restore from Backup — Implementation Plan

## Overview

Add a restore feature that lets a user upload a backup JSON file (produced by
`data-backup`) and replace all database content with the backup snapshot. Two
entry points: a `/setup` page for fresh installs (no users in DB yet) and a
`RestoreButton` in the nav for logged-in users who want to restore at any time.
After restore the current session is cleared and the user must re-login.

## Current State Analysis

The backup format is defined in the `data-backup` plan: a JSON file with
`schema_version: 1`, `exported_at`, `users`, `bill_templates`, and
`payment_instances`, each row containing every column from the corresponding
table.

No restore endpoint exists in the backend. No setup-detection or setup page
exists on the frontend. The root `/` unconditionally redirects to `/login`
(`frontend/src/app/page.tsx:4`). The login page has no setup-status check. The
dashboard nav has no restore affordance.

PostgreSQL sequences for the three tables are `users_id_seq`,
`bill_templates_id_seq`, and `payment_instances_id_seq` — confirmed from the
Alembic initial migration (`7d724b18e569_initial_schema.py`). No raw SQL exists
in the application today; sequence resets will be the first use of
`db.execute(text(...))`.

## Desired End State

- `GET /restore/setup-status` returns `{"needs_setup": true}` when the `users`
  table is empty; `false` otherwise.
- `POST /restore/setup` accepts a `.json` file (multipart), validates
  `schema_version == 1`, wipes the DB, restores all three tables, and resets
  sequences. Rejects with 409 if any users already exist.
- `POST /restore` does the same but requires a valid JWT. Callable anytime.
- The `/login` page silently redirects to `/setup` when `needs_setup: true`.
- `/setup` shows two cards: "Start Fresh → Register" and "Restore Backup
  (file picker + Restore button)".
- A RestoreButton icon lives in the dashboard nav between BackupButton and
  ThemeToggle. Clicking opens a dialog with a file picker, a warning, a
  confirmation checkbox, and a Restore button that activates only when both are
  satisfied. After a successful restore the frontend calls `logout()`.

### Key Discoveries

- Token is stored in a **cookie** (`frontend/src/lib/auth.ts:14`,
  `SameSite=Lax`). `logout()` (`auth-context.tsx:33`) clears it and calls
  `router.replace('/login')` — no server-side session invalidation needed.
- `BillFrequency` and `PaymentStatus` are `str, Enum` subclasses
  (`backend/app/models/bill.py:21,29`) — they JSON-deserialize directly from
  string values in the backup.
- `Decimal` fields must be wrapped in `Decimal(str(...))` when inserting from
  the JSON float values.
- `amount` column on `BillTemplate` uses `Numeric(12,2)` and is non-nullable;
  `PaymentInstance.amount` likewise. Validate these are present in the payload
  before touching the DB.

## What We're NOT Doing

- No merge / upsert — restore is always wipe-then-replace.
- No selective restore (e.g., "only bill templates") — always restores the full
  snapshot.
- No backup of current data before restoring — user is responsible for having a
  backup before triggering a restore.
- No import from `.xlsx` — JSON backup only.

## Implementation Approach

Backend first (Phase 1): one new router `restore.py` with three endpoints sharing
a private `_execute_restore` helper. The helper owns all the destructive and
insert logic, including sequence resets via raw SQL. The endpoints differ only in
their auth guard.

Frontend setup flow second (Phase 2): login page gets a silent setup-status check
on mount; a new `/setup` page handles the fresh-install case with the two-card
layout.

Frontend dashboard restore third (Phase 3): `RestoreButton` component wired into
the nav, covering the anytime-restore use case for logged-in users.

## Critical Implementation Details

**FK ordering is load-bearing.** Deletion must happen in reverse-FK order:
`payment_instances` → `bill_templates` → `users`. Insertion must follow FK order:
`users` → `bill_templates` → `payment_instances`. Swapping either order will
raise a PostgreSQL foreign-key violation inside the transaction.

**Sequence reset SQL.** After bulk-inserting rows with explicit IDs, the
PostgreSQL auto-increment sequences remain at their pre-restore values. The
reset must set each sequence's next value to `max(id) + 1`. Use the
`is_called=false` form to handle empty tables safely:
```sql
SELECT setval('users_id_seq',
  COALESCE((SELECT MAX(id) FROM users), 0) + 1, false);
```
This works for both non-empty tables (next id = max + 1) and empty tables
(next id = 1). Run this for all three tables after all inserts, still inside
the same transaction.

**Router filename.** The file cannot be named `import.py` — `import` is a
Python reserved keyword and the module would fail to load. Use `restore.py`.

**Multipart upload.** Both restore endpoints accept the backup file as
`multipart/form-data` (FastAPI `UploadFile`). The frontend sends it via the
Fetch API with `FormData` — do not set `Content-Type` manually when using
`FormData` (the browser adds the boundary automatically).

---

## Phase 1: Backend — Restore endpoints

### Overview

New router `restore.py` registered in `main.py` under the `/restore` prefix.
Three endpoints: public setup-status check, unauthenticated setup restore
(gated), and authenticated anytime restore.

### Changes Required

#### 1. New restore router

**File**: `backend/app/routers/restore.py`

**Intent**: Create the router with all three endpoints and a shared private
`_execute_restore(db, payload)` helper that owns the wipe → insert → sequence
reset logic.

**Contract**:

- `GET /restore/setup-status` — no auth dependency; queries
  `db.query(User).count()`; returns `{"needs_setup": bool}`.

- `POST /restore/setup` — no auth dependency; raises `HTTPException(409)` if
  `db.query(User).count() > 0`; calls `_execute_restore`; returns `{"ok": true}`.

- `POST /restore` — requires `current_user` dependency (standard JWT check);
  calls `_execute_restore`; returns `{"ok": true}`.

- `_execute_restore(db, payload)` private function:
  1. Validate `payload.get("schema_version") == 1` → `HTTPException(422,
     "Unsupported backup format (schema_version: {v}). This app supports version 1.")`
  2. Validate required keys present: `users`, `bill_templates`,
     `payment_instances` → `HTTPException(422, "Invalid backup file.")`
  3. Delete in FK order using ORM bulk-delete (synchronize_session=False)
  4. Insert `users` rows as `User(...)` objects; use `db.add_all()`
  5. `db.flush()` — makes user IDs available for the FK in bill_templates
  6. Insert `bill_templates` rows; wrap `amount` in `Decimal(str(row["amount"]))`
  7. `db.flush()`
  8. Insert `payment_instances` rows; wrap `amount` and `paid_amount` similarly;
     parse `due_date` with `date.fromisoformat()`; parse `paid_at` and
     `created_at` with `datetime.fromisoformat()` where not None
  9. Reset sequences with three `db.execute(text(...))` calls (see Critical
     Implementation Details for exact SQL)
  10. `db.commit()`

Both restore endpoints read the uploaded file with `await file.read()` then
`json.loads(content)`.

#### 2. Register restore router in main.py

**File**: `backend/app/main.py`

**Intent**: Add `from app.routers import restore` and
`app.include_router(restore.router)` alongside the existing three routers.

**Contract**: Import and include order does not matter; add after `export.router`.

### Success Criteria

#### Automated Verification

- Backend starts without errors after adding the new router
- `GET /restore/setup-status` returns 200 with `{"needs_setup": true}` on a
  fresh DB (no users) and `false` after any user exists
- `POST /restore/setup` with a valid `schema_version: 1` backup returns 200 on
  empty DB, 409 when users already exist
- `POST /restore` with a valid JWT and valid backup returns 200 and all three
  tables match the backup content
- Sequences are correctly reset: after restore, inserting a new row without an
  explicit ID uses the next ID after the max restored ID

#### Manual Verification

- Upload the backup file via Swagger UI (`http://localhost:8010/docs`) against
  both endpoints; verify DB content via `/export/json` immediately after
- Test invalid `schema_version: 99` → verify 422 with the version-specific
  error message
- Test a backup file with a missing key (`payment_instances` removed) → 422

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Frontend — Fresh-install setup page

### Overview

The login page gains a silent `needs_setup` check on mount. A new `/setup`
page serves fresh installs with a two-card layout (Register or Restore).

### Changes Required

#### 1. Setup-status API function

**File**: `frontend/src/lib/import-api.ts` (new file)

**Intent**: Provide two public functions — `checkSetupStatus()` and
`restoreFromSetup(file)` — used exclusively by the setup page flow. No auth
header is sent for either.

**Contract**:

- `checkSetupStatus(): Promise<boolean>` — `GET /restore/setup-status`, returns
  `data.needs_setup`.
- `restoreFromSetup(file: File): Promise<void>` — `POST /restore/setup` with
  `FormData` containing the file under the key `"file"`; throws on non-2xx.

#### 2. Login page setup-status check

**File**: `frontend/src/app/login/page.tsx`

**Intent**: Add a `useEffect` that calls `checkSetupStatus()` once on mount; if
`true`, calls `router.replace('/setup')`. The redirect is silent — no loading
state shown to the user.

**Contract**: The effect runs once (`[]` dependency array). It must not block
rendering of the login form — the form renders immediately; the redirect fires
asynchronously if needed.

#### 3. Setup page

**File**: `frontend/src/app/setup/page.tsx` (new file)

**Intent**: Two-card layout for fresh-install setup. Guards itself: if
`needs_setup` is `false` on mount, redirects to `/login`.

**Contract**:

- `"use client"` component.
- On mount: call `checkSetupStatus()`; if `false`, `router.replace('/login')`.
- Left card: heading from `t("startFreshTitle")`, subtitle from
  `t("startFreshDesc")`, a `<Link href="/register">` styled as a primary button.
- Right card: heading from `t("restoreTitle")`, subtitle from
  `t("restoreDesc")`; `<input type="file" accept=".json">` (uncontrolled);
  a Restore button that calls `restoreFromSetup(file)` and on success
  `router.replace('/login')`.
- Error and loading states on the Restore button following the pattern from
  `login/page.tsx`.
- Visual style matches login/register pages: centered max-w container,
  `rounded-2xl border bg-white dark:bg-slate-800` cards.

#### 4. Setup page translations

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`,
`frontend/messages/de.json`

**Intent**: Add a `SetupPage` namespace to all three locale files.

**Contract**:

English:
```json
"SetupPage": {
  "title": "Welcome to Pay Tracker",
  "subtitle": "This appears to be a fresh installation.",
  "startFreshTitle": "Start Fresh",
  "startFreshDesc": "Create a new household account and start adding your bills.",
  "startFreshAction": "Register →",
  "restoreTitle": "Restore Backup",
  "restoreDesc": "Upload a .json backup file to restore all your data.",
  "chooseFile": "Choose backup file",
  "noFileChosen": "No file chosen",
  "restoreAction": "Restore",
  "restoring": "Restoring…",
  "restoreError": "Restore failed. Make sure the file is a valid Pay Tracker backup."
}
```

Polish (`pl.json`) — add sibling to other namespaces:
```json
"SetupPage": {
  "title": "Witaj w Pay Tracker",
  "subtitle": "Wygląda na to, że to nowa instalacja.",
  "startFreshTitle": "Zacznij od nowa",
  "startFreshDesc": "Utwórz nowe konto domowe i zacznij dodawać rachunki.",
  "startFreshAction": "Zarejestruj się →",
  "restoreTitle": "Przywróć kopię zapasową",
  "restoreDesc": "Prześlij plik .json z kopią zapasową, aby przywrócić wszystkie dane.",
  "chooseFile": "Wybierz plik kopii zapasowej",
  "noFileChosen": "Nie wybrano pliku",
  "restoreAction": "Przywróć",
  "restoring": "Przywracanie…",
  "restoreError": "Przywracanie nie powiodło się. Upewnij się, że plik jest prawidłową kopią Pay Tracker."
}
```

German (`de.json`):
```json
"SetupPage": {
  "title": "Willkommen bei Pay Tracker",
  "subtitle": "Dies scheint eine Neuinstallation zu sein.",
  "startFreshTitle": "Neu beginnen",
  "startFreshDesc": "Erstellen Sie ein neues Haushaltskonto und beginnen Sie, Ihre Rechnungen hinzuzufügen.",
  "startFreshAction": "Registrieren →",
  "restoreTitle": "Backup wiederherstellen",
  "restoreDesc": "Laden Sie eine .json-Backup-Datei hoch, um alle Daten wiederherzustellen.",
  "chooseFile": "Backup-Datei auswählen",
  "noFileChosen": "Keine Datei ausgewählt",
  "restoreAction": "Wiederherstellen",
  "restoring": "Wird wiederhergestellt…",
  "restoreError": "Wiederherstellung fehlgeschlagen. Stellen Sie sicher, dass die Datei ein gültiges Pay Tracker-Backup ist."
}
```

### Success Criteria

#### Automated Verification

- ESLint passes: `cd frontend && npm run lint`
- No TypeScript errors

#### Manual Verification

- On a fresh DB (no users): visiting `/login` redirects to `/setup`
- `/setup` shows two cards with correct copy
- Uploading a valid backup on the `/setup` Restore card restores data and
  redirects to `/login`; logging in with restored credentials succeeds
- Uploading an invalid file on `/setup` shows the error message
- On a DB with users: visiting `/setup` redirects to `/login`

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Frontend — RestoreButton for logged-in users

### Overview

A `RestoreButton` nav component for the anytime-restore use case. Placed in the
dashboard nav between BackupButton and ThemeToggle. After a successful restore,
calls `logout()` to clear the session and redirect to `/login`.

### Changes Required

#### 1. Authenticated restore API function

**File**: `frontend/src/lib/import-api.ts`

**Intent**: Add `restoreAuthenticated(file)` alongside the existing
`restoreFromSetup` — same `FormData` pattern but includes the `Authorization`
header.

**Contract**: `restoreAuthenticated(file: File): Promise<void>` — `POST /restore`
with `Authorization: Bearer <token>` (via `getAuthToken()`) and `FormData`
containing the file under `"file"`; throws on non-2xx.

#### 2. RestoreButton component

**File**: `frontend/src/components/RestoreButton.tsx` (new file)

**Intent**: Self-contained component: icon trigger button + confirmation dialog
with file picker + checkbox guard + loading/error states. On success calls
`logout()` from `useAuth()`.

**Contract**:

- Trigger button: same `className` as `ThemeToggle` (`rounded-lg p-2
  text-slate-500 hover:bg-slate-100 …`); icon `HardDriveUpload` size 18 from
  lucide-react (fall back to `Upload` if unavailable); `aria-label={t("ariaLabel")}`.
- State: `"idle" | "confirming" | "restoring" | "error"`.
- Dialog structure (same backdrop pattern as `ArchiveConfirmDialog`):
  - Icon accent: amber/warning colour (not red — this is not delete, but it is
    destructive)
  - Title: `t("dialogTitle")`
  - Warning paragraph: `t("dialogWarning")` — mentions data replacement and
    forced logout
  - `<input type="file" accept=".json">` — file selection displayed as filename
    or `t("noFileChosen")`
  - Checkbox: `t("checkboxLabel")` — must be ticked
  - Restore button: disabled until both file is selected AND checkbox is ticked;
    shows spinner + `t("restoring")` during upload
  - Error paragraph below buttons: shown when state is "error"
- On confirm: call `restoreAuthenticated(selectedFile)`, on success call
  `logout()` (which navigates to `/login`), on error transition to "error" state.

#### 3. Wire RestoreButton into dashboard nav

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Import RestoreButton and insert it between BackupButton and
ThemeToggle in the right-side controls div.

**Contract**: Nav order becomes `<LanguageToggle /> <BackupButton />
<RestoreButton /> <ThemeToggle /> <LogOut button>` at `layout.tsx:70-81`.

#### 4. RestoreButton translations

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`,
`frontend/messages/de.json`

**Intent**: Add a `RestoreButton` namespace to all three locale files.

**Contract**:

English:
```json
"RestoreButton": {
  "ariaLabel": "Restore from backup",
  "dialogTitle": "Restore from Backup",
  "dialogWarning": "This will permanently replace all current data — bill templates, payment history, and user accounts — with the contents of the backup file. You will be logged out immediately after restore.",
  "chooseFile": "Choose backup file (.json)",
  "noFileChosen": "No file chosen",
  "checkboxLabel": "I understand this will permanently replace all data and I will be logged out.",
  "cancel": "Cancel",
  "confirm": "Restore",
  "restoring": "Restoring…",
  "error": "Restore failed. Make sure the file is a valid Pay Tracker backup (schema_version 1)."
}
```

Polish:
```json
"RestoreButton": {
  "ariaLabel": "Przywróć z kopii zapasowej",
  "dialogTitle": "Przywróć z kopii zapasowej",
  "dialogWarning": "Spowoduje to trwałe zastąpienie wszystkich bieżących danych — szablonów rachunków, historii płatności i kont użytkowników — zawartością pliku kopii zapasowej. Zostaniesz wylogowany natychmiast po przywróceniu.",
  "chooseFile": "Wybierz plik kopii zapasowej (.json)",
  "noFileChosen": "Nie wybrano pliku",
  "checkboxLabel": "Rozumiem, że spowoduje to trwałe zastąpienie wszystkich danych i zostanę wylogowany.",
  "cancel": "Anuluj",
  "confirm": "Przywróć",
  "restoring": "Przywracanie…",
  "error": "Przywracanie nie powiodło się. Upewnij się, że plik jest prawidłową kopią Pay Tracker (schema_version 1)."
}
```

German:
```json
"RestoreButton": {
  "ariaLabel": "Aus Backup wiederherstellen",
  "dialogTitle": "Aus Backup wiederherstellen",
  "dialogWarning": "Dadurch werden alle aktuellen Daten — Rechnungsvorlagen, Zahlungshistorie und Benutzerkonten — dauerhaft durch den Inhalt der Backup-Datei ersetzt. Sie werden unmittelbar nach der Wiederherstellung abgemeldet.",
  "chooseFile": "Backup-Datei auswählen (.json)",
  "noFileChosen": "Keine Datei ausgewählt",
  "checkboxLabel": "Ich verstehe, dass dadurch alle Daten dauerhaft ersetzt werden und ich abgemeldet werde.",
  "cancel": "Abbrechen",
  "confirm": "Wiederherstellen",
  "restoring": "Wird wiederhergestellt…",
  "error": "Wiederherstellung fehlgeschlagen. Stellen Sie sicher, dass die Datei ein gültiges Pay Tracker-Backup ist (schema_version 1)."
}
```

### Success Criteria

#### Automated Verification

- ESLint passes: `cd frontend && npm run lint`
- No TypeScript errors

#### Manual Verification

- RestoreButton (upload icon) appears in nav between BackupButton and ThemeToggle
- Clicking the button opens the confirmation dialog
- Restore button is disabled until a `.json` file is selected AND checkbox is
  ticked
- Uploading a valid backup file restores data and immediately navigates to
  `/login`; logging in with restored credentials succeeds
- Uploading an invalid file (wrong schema_version or malformed JSON) shows the
  error message in the dialog; the app remains usable
- Pressing Escape or Cancel closes the dialog without restoring
- No regressions on backup download, xlsx export, or any other nav controls

---

## Testing Strategy

### Manual Testing Steps

1. `docker compose up --build` — start the full stack
2. **Phase 1 verification**: use Swagger UI at `http://localhost:8010/docs`
   - `GET /restore/setup-status` → `{"needs_setup": false}` (users exist)
   - `POST /restore` with a valid backup → 200; then `GET /export/json` to
     verify restored data matches
   - `POST /restore/setup` with users existing → 409
   - Wipe DB (`docker compose down -v && docker compose up --build`), then
     `POST /restore/setup` → 200; data now restored
3. **Phase 2 verification**: visit `/` on a fresh DB → ends up at `/setup`
   - Register card links to `/register` correctly
   - Restore card uploads and restores, redirects to `/login`
4. **Phase 3 verification**: log in; click RestoreButton in nav
   - Verify dialog, checkbox guard, file selection requirement
   - Upload the backup → logout → re-login with backup credentials

## References

- Backup format spec: `context/changes/data-backup/plan.md`
- Export router (reference for ORM patterns): `backend/app/routers/export.py`
- Auth context (logout): `frontend/src/context/auth-context.tsx:33`
- Token storage: `frontend/src/lib/auth.ts`
- Dialog pattern: `frontend/src/components/bills/ArchiveConfirmDialog.tsx`
- Nav button pattern: `frontend/src/components/ThemeToggle.tsx`
- PostgreSQL sequences: `backend/alembic/versions/7d724b18e569_initial_schema.py`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — Restore endpoints

#### Automated

- [ ] 1.1 Backend starts without errors after adding `restore.py` router
- [ ] 1.2 `GET /restore/setup-status` returns correct `needs_setup` value
- [ ] 1.3 `POST /restore/setup` returns 200 on empty DB, 409 when users exist
- [ ] 1.4 `POST /restore` with valid JWT and valid backup returns 200
- [ ] 1.5 DB content matches backup after restore (verified via `/export/json`)
- [ ] 1.6 Sequences correctly reset (next insert uses ID after max restored ID)

#### Manual

- [ ] 1.7 Invalid `schema_version: 99` → 422 with version-specific message
- [ ] 1.8 Backup missing `payment_instances` key → 422

### Phase 2: Frontend — Fresh-install setup page

#### Automated

- [ ] 2.1 ESLint passes after Phase 2 changes
- [ ] 2.2 No TypeScript errors after Phase 2 changes

#### Manual

- [ ] 2.3 Fresh DB: visiting `/login` redirects to `/setup`
- [ ] 2.4 `/setup` shows two cards with correct copy
- [ ] 2.5 Restore card restores data and redirects to `/login`
- [ ] 2.6 Invalid file on setup restore card shows error message
- [ ] 2.7 DB with users: visiting `/setup` redirects to `/login`

### Phase 3: Frontend — RestoreButton for logged-in users

#### Automated

- [ ] 3.1 ESLint passes after Phase 3 changes
- [ ] 3.2 No TypeScript errors after Phase 3 changes

#### Manual

- [ ] 3.3 RestoreButton visible in nav between BackupButton and ThemeToggle
- [ ] 3.4 Restore button disabled until file selected AND checkbox ticked
- [ ] 3.5 Valid backup restores data and navigates to `/login`
- [ ] 3.6 Invalid backup shows error; app remains usable
- [ ] 3.7 Escape and Cancel close dialog without restoring
- [ ] 3.8 No regressions on backup, xlsx export, or nav controls
