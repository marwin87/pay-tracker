# Data Backup Implementation Plan

## Overview

Implement FR-011: a one-click full data backup that downloads a complete 1:1
JSON snapshot of the database — bill templates, payment instances, and user
accounts — with a nav-level Backup button and a confirmation dialog.

## Current State Analysis

The backend already has `GET /export/json` (`backend/app/routers/export.py:86`)
but it is incomplete as a true backup:

- `bill_templates` payload is missing `currency`, `start_period`, `created_at`
- `payment_instances` payload is missing `created_at`
- `users` table is not exported at all
- No `schema_version` field exists for future import tooling

The frontend has no trace of backup: `export-api.ts` exports only
`downloadXlsx`, and there is no button or dialog anywhere.

## Desired End State

- `GET /export/json` returns a versioned JSON snapshot containing every column
  of every row in `bill_templates`, `payment_instances`, and `users`
- The dashboard nav bar shows a Backup icon button between LanguageToggle and
  ThemeToggle
- Clicking the button opens a confirmation dialog; confirming downloads the file
- The feature is fully translated in EN / PL / DE

### Key Discoveries

- `BillFrequency` and `PaymentStatus` are `str, Enum` subclasses
  (`backend/app/models/bill.py:21,29`) — they serialize as plain strings in
  `json.dumps`, no `.value` call needed
- `Decimal` fields (`amount`, `paid_amount`) must be wrapped in `float()`
  before inclusion in the JSON payload — existing code already does this for
  instances
- Dialog pattern: `ArchiveConfirmDialog.tsx` (`frontend/src/components/bills/`)
  uses a backdrop `div` + role="dialog" — follow the same structure
- ThemeToggle styling (`frontend/src/components/ThemeToggle.tsx:24`) is the
  template for the trigger button style
- Nav insertion point: `dashboard/layout.tsx:70` — `<LanguageToggle />` then
  `<ThemeToggle />` then logout; Backup button goes between Language and Theme

## What We're NOT Doing

- No import / restore endpoint (deferred to a future change)
- No scheduled or server-side backup storage — download only
- No per-table selective backup — always exports the full database

## Implementation Approach

Two phases: fix the backend payload first (low risk, isolated), then wire the
entire frontend surface (component + nav + translations) in one phase.

## Phase 1: Backend — Complete the JSON backup format

### Overview

Update the `/export/json` endpoint to export every column of every row in the
three tables, and add a top-level `schema_version` field.

### Changes Required

#### 1. Update `/export/json` endpoint

**File**: `backend/app/routers/export.py`

**Intent**: Replace the partial payload with a full snapshot of all three
tables. Import the `User` model, query it, and include all its fields. Expand
`bill_templates` and `payment_instances` entries to cover every mapped column.

**Contract**: Top-level JSON structure becomes:

```json
{
  "schema_version": 1,
  "exported_at": "<ISO-8601 UTC datetime>",
  "users": [
    {
      "id": int,
      "email": str,
      "password_hash": str,
      "is_active": bool,
      "language_preference": str | null,
      "created_at": "<ISO-8601>"
    }
  ],
  "bill_templates": [
    {
      "id": int,
      "name": str,
      "category": str | null,
      "frequency": str,
      "amount": float,
      "currency": str,
      "due_day": int | null,
      "notes": str | null,
      "is_archived": bool,
      "is_paused": bool,
      "start_period": str | null,
      "created_at": "<ISO-8601>"
    }
  ],
  "payment_instances": [
    {
      "id": int,
      "bill_id": int,
      "period": str,
      "due_date": "<YYYY-MM-DD>",
      "amount": float,
      "status": str,
      "paid_at": "<ISO-8601>" | null,
      "paid_amount": float | null,
      "notes": str | null,
      "created_at": "<ISO-8601>"
    }
  ]
}
```

Add `from app.models.user import User` to imports. Query `db.query(User).all()`.
`paid_at`, `created_at` (datetime) → `.isoformat()`; `due_date` (date) →
`.isoformat()`; `amount`, `paid_amount` (Decimal) → `float()` / conditional
`float()`.

### Success Criteria

#### Automated Verification

- Backend starts without import errors: `docker compose up --build` shows no
  Python import errors in the backend container logs
- Endpoint returns HTTP 200 with all five top-level keys: `schema_version`,
  `exported_at`, `users`, `bill_templates`, `payment_instances`
- `bill_templates` entries include `currency`, `start_period`, `created_at`
- `payment_instances` entries include `created_at`

#### Manual Verification

- Hit `GET /export/json` via Swagger UI (`http://localhost:8010/docs`) — verify
  downloaded JSON contains user rows with `password_hash` present and all
  template / instance fields complete
- Confirm the filename is `pay-tracker-backup-<date>.json`

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation before proceeding to
Phase 2.

---

## Phase 2: Frontend — Backup button + dialog + nav integration

### Overview

Add a `downloadBackup()` API function, a self-contained `BackupButton` component
(trigger button + confirmation dialog), wire it into the nav, and add i18n
translations for all three locales.

### Changes Required

#### 1. Add `downloadBackup` API function

**File**: `frontend/src/lib/export-api.ts`

**Intent**: Add a `downloadBackup()` function that fetches `GET /export/json`,
creates a blob URL, and triggers a browser download — mirroring the existing
`downloadXlsx` function directly below it.

**Contract**: `export async function downloadBackup(): Promise<void>` — no
parameters; filename derived from today's date:
`pay-tracker-backup-<YYYY-MM-DD>.json`.

#### 2. Create `BackupButton` component

**File**: `frontend/src/components/BackupButton.tsx`

**Intent**: Self-contained component with three states — idle (icon button),
confirming (modal dialog open), downloading (confirm button shows spinner).
Follows the same pattern as `ThemeToggle` for the trigger button and
`ArchiveConfirmDialog` for the modal.

**Contract**:

- Trigger button: same `className` as ThemeToggle's button
  (`rounded-lg p-2 text-slate-500 hover:bg-slate-100 …`) with `HardDriveDownload`
  icon (size 18) from lucide-react; `aria-label={t("ariaLabel")}`
- Dialog: full-screen backdrop (`fixed inset-0 z-50 …`), role="dialog",
  aria-modal, Escape-key closes; icon accent uses indigo (not red — this is not
  a destructive action); Cancel + Download buttons; error text shown below
  buttons if download fails
- State: `useState<"idle" | "confirming" | "downloading" | "error">`; on
  confirm, call `downloadBackup()`, catch errors and transition to "error"

#### 3. Wire BackupButton into nav

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Import `BackupButton` and insert it between `<LanguageToggle />` and
`<ThemeToggle />` in the right-side controls div (`layout.tsx:70`).

**Contract**: `<BackupButton />` inserted at `layout.tsx:71` (between the two
existing toggles).

#### 4. Add i18n translations

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`,
`frontend/messages/de.json`

**Intent**: Add a `BackupButton` namespace to each file covering all string keys
used by the component.

**Contract**: Add at the same nesting level as `ThemeToggle`:

```json
"BackupButton": {
  "ariaLabel": "Download backup",
  "dialogTitle": "Download Backup",
  "dialogDescription": "This will download a complete copy of all Pay Tracker data — bill templates, payment history, and user accounts. Store the file securely.",
  "cancel": "Cancel",
  "confirm": "Download",
  "downloading": "Downloading…",
  "error": "Backup failed. Please try again."
}
```

Polish (`pl.json`):
```json
"BackupButton": {
  "ariaLabel": "Pobierz kopię zapasową",
  "dialogTitle": "Pobierz kopię zapasową",
  "dialogDescription": "Zostanie pobrana pełna kopia danych Pay Tracker — szablony rachunków, historia płatności i konta użytkowników. Przechowuj plik w bezpiecznym miejscu.",
  "cancel": "Anuluj",
  "confirm": "Pobierz",
  "downloading": "Pobieranie…",
  "error": "Tworzenie kopii nie powiodło się. Spróbuj ponownie."
}
```

German (`de.json`):
```json
"BackupButton": {
  "ariaLabel": "Backup herunterladen",
  "dialogTitle": "Backup herunterladen",
  "dialogDescription": "Es wird eine vollständige Kopie aller Pay Tracker-Daten heruntergeladen – Rechnungsvorlagen, Zahlungshistorie und Benutzerkonten. Bewahren Sie die Datei sicher auf.",
  "cancel": "Abbrechen",
  "confirm": "Herunterladen",
  "downloading": "Wird heruntergeladen…",
  "error": "Backup fehlgeschlagen. Bitte erneut versuchen."
}
```

### Success Criteria

#### Automated Verification

- ESLint passes: `cd frontend && npm run lint`
- No TypeScript errors (check IDE diagnostics or `npx tsc --noEmit`)

#### Manual Verification

- Backup icon button is visible in the nav between the language selector and the
  theme toggle
- Clicking the button shows the confirmation dialog with title, description,
  Cancel, and Download buttons
- Pressing Escape closes the dialog without downloading
- Clicking Cancel closes the dialog
- Clicking Download shows a spinner on the button, then downloads a `.json` file
  named `pay-tracker-backup-<date>.json`
- The downloaded JSON contains `schema_version: 1`, `users`, `bill_templates`
  (with `currency`, `start_period`, `created_at`), and `payment_instances`
  (with `created_at`)
- No regressions: xlsx export buttons on Payments page still work

---

## Testing Strategy

### Manual Testing Steps

1. Start the app: `docker compose up --build`
2. Log in with a test account that has at least one bill template and payment instance
3. Verify Backup button appears in nav (between language and theme toggles)
4. Click it — confirm dialog appears with correct text in the current language
5. Press Escape — dialog closes
6. Click Backup → Cancel — dialog closes
7. Click Backup → Download — file downloads; inspect JSON structure in a text editor:
   - `schema_version: 1` present
   - `users` array has rows with `email`, `password_hash`
   - `bill_templates` rows include `currency`, `start_period`
   - `payment_instances` rows include `created_at`
8. Switch language to PL, open dialog — verify Polish strings appear
9. Switch to DE — verify German strings appear
10. Trigger a download failure (temporarily shut down backend) — verify error message appears in the dialog

## References

- PRD: `context/foundation/prd.md` (FR-011)
- Existing export router: `backend/app/routers/export.py`
- Existing xlsx client: `frontend/src/lib/export-api.ts`
- Dialog pattern: `frontend/src/components/bills/ArchiveConfirmDialog.tsx`
- Nav button pattern: `frontend/src/components/ThemeToggle.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — Complete the JSON backup format

#### Automated

- [x] 1.1 Backend starts without import errors after change to `export.py` — e4256ee
- [x] 1.2 `GET /export/json` returns HTTP 200 with all five top-level keys — e4256ee
- [x] 1.3 `bill_templates` entries include `currency`, `start_period`, `created_at` — e4256ee
- [x] 1.4 `payment_instances` entries include `created_at` — e4256ee

#### Manual

- [x] 1.5 Swagger UI download contains user rows with `password_hash` — e4256ee
- [x] 1.6 Filename is `pay-tracker-backup-<date>.json` — e4256ee

### Phase 2: Frontend — Backup button + dialog + nav integration

#### Automated

- [x] 2.1 ESLint passes: `cd frontend && npm run lint` — e4256ee
- [x] 2.2 No TypeScript errors — e4256ee

#### Manual

- [x] 2.3 Backup icon button visible in nav between language and theme toggles — e4256ee
- [x] 2.4 Clicking button opens confirmation dialog — e4256ee
- [x] 2.5 Escape and Cancel close dialog without downloading — e4256ee
- [x] 2.6 Download button triggers file download with correct filename and JSON structure — e4256ee
- [x] 2.7 Error message shown in dialog when backend is unreachable — e4256ee
- [x] 2.8 Dialog strings correct in PL and DE locales — e4256ee
- [x] 2.9 No regressions on xlsx export buttons — e4256ee
