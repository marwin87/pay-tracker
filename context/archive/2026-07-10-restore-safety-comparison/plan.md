# Restore Safety Comparison Implementation Plan

## Overview

Before a user confirms a restore-from-backup, show them a comparison of their current data (bill count, payment count) against the backup file they picked (same counts, plus the backup's export date), with a warning if the backup would reduce their data. This targets the specific failure mode identified during the app audit: `POST /export/restore` performs a full destructive replace with no preview, so restoring a stale backup silently discards newer history. The existing confirmation dialog already blocks accidental clicks; this adds the missing signal — *how stale is this file, and what would I lose*.

## Current State Analysis

- `POST /export/restore` (`backend/app/routers/export.py:174-262`) validates JSON/schema/size, then unconditionally deletes all of the user's `BillTemplate`/`PaymentInstance` rows and re-inserts the backup's contents. This behavior is correct and out of scope — this plan only adds a pre-confirmation signal, not a change to restore semantics.
- `GET /export/json` (`export.py:109-171`) is the backup generator: it scopes to `me.id`, excludes soft-deleted instances (`PaymentInstance.is_deleted.is_(False)`), and stamps `exported_at` (ISO UTC) + `exported_by` at the top level of the payload — alongside `bill_templates` and `payment_instances` arrays. `BackupPayload` (`backend/app/schemas/bill.py:116-119`) does NOT include `exported_at`/`exported_by` as schema fields — they're extra keys on the raw dict, ignored on restore.
- `RestoreButton.tsx` (`frontend/src/components/RestoreButton.tsx`) is a `"use client"` component with a `idle → confirming → restoring → (idle|error)` state machine. File selection (`handleFileChange`, lines 22-33) already does a 10MB size check before moving to `"confirming"`. The dialog (lines 79-137) is a `createPortal` modal into `document.body`, shows `dialogTitle`/`dialogDescription`/`cancel`/`confirm` from the `RestoreButton` i18n namespace, and calls `restoreFromBackup(selectedFile)` (`frontend/src/lib/export-api.ts:20-32`) only from `handleConfirm`.
- `restoreFromBackup` does a raw `fetch` (not `apiFetch`), so a 401 during restore does not trigger the app's normal `SessionExpiredError` auto-logout path. This is a known, separate issue — explicitly out of scope for this change (see `change.md`).
- Date formatting elsewhere in the app uses `Intl.DateTimeFormat(locale, {...})` with `locale` from `useLocale()` (`next-intl`), e.g. `frontend/src/components/payments/PaymentRow.tsx:70`. This plan follows the same pattern rather than introducing a new date-formatting utility.
- i18n: three locale files (`frontend/messages/{en,pl,de}.json`), each with a `RestoreButton` key holding `ariaLabel`, `dialogTitle`, `dialogDescription`, `cancel`, `confirm`, `restoring`, `error`, `fileTooLarge`. Locale files must stay strict JSON (no trailing commas) and are edited by hand across all three — no formatter runs automatically on sibling files.
- Backend test pattern for a new user-scoped read endpoint: `backend/tests/test_export_xlsx.py` (data-correctness assertions) and `backend/tests/test_user_scoping.py` (cross-user isolation, e.g. `test_export_json_scoped` at line 148) — this plan's new endpoint test follows both patterns.
- E2E: `frontend/tests/e2e/06-export-restore.spec.ts` is a happy-path round-trip test only (create → export → restore → assert count unchanged). It uses `loginNewUser`/`createBillViaApi` helpers from `./helpers` and drives the real `RestoreButton` UI via Playwright's file chooser.

### Key Discoveries:

- `GET /export/json`'s instance query (`export.py:116-125`) already excludes `is_deleted` rows — the new summary endpoint must match this exactly, since backups never contain soft-deleted rows and the comparison would otherwise always show "backup has fewer payments," defeating the warning's purpose.
- The `confirming` dialog already has an `error`-adjacent state; the new client-side file-validation error reuses the existing `"error"` state and `errorMsg` field rather than introducing a new state.
- No backend schema/model changes are needed — this is a read-only count endpoint plus a client-parsed-JSON comparison. No Alembic migration.

## Desired End State

A user who picks a backup file to restore sees, before they can click "Replace My Data":
- Current data counts (bills, payments) fetched live from the backend.
- The backup file's counts (parsed client-side from the picked file) and its export date (or "export date unknown" for schema_version 2 backups without `exported_at`).
- A visible warning line when the backup has fewer bills or fewer payments than current data.

A user who picks a file that isn't valid JSON, or is missing `bill_templates`/`payment_instances`, sees an inline error immediately and never reaches the confirmation dialog — mirroring the existing 10MB size-check behavior.

**Verification:** `docker compose up --build`, register a user, create 2+ bills, export a backup, delete one bill (or its payments), attempt to restore the earlier backup — the dialog shows current counts > backup counts is false (backup has more) confirms no warning; deleting after export and restoring the same file shows the warning. Picking a `.txt` file renamed to `.json` with non-JSON content shows the inline error immediately.

## What We're NOT Doing

- Not changing `POST /export/restore`'s destructive replace semantics (no merge, no dry-run, no undo) — that's the separate `restore-auto-backup-safety-net` change (S-19).
- Not fixing `restoreFromBackup`'s bypass of `apiFetch`/401 handling — known, separate, unrelated issue.
- Not adding a new date-formatting utility — reusing the existing `Intl.DateTimeFormat` + `useLocale()` pattern.
- Not validating the backup's full schema client-side (Pydantic validation stays server-side, on submit) — client-side validation is limited to "is this JSON, and does it have the two expected array keys" so the comparison numbers can be computed.

## Implementation Approach

Three independently testable phases: backend read-only endpoint first (small, isolated, easy to verify with pytest in isolation), then the frontend dialog changes that consume it, then e2e coverage that exercises the full flow end-to-end. Each phase ships working, verifiable code before the next begins.

## Phase 1: Backend summary endpoint

### Overview

Add `GET /export/summary`, returning current bill/payment counts scoped to the authenticated user, matching `/export/json`'s exclusion of soft-deleted instances.

### Changes Required:

#### 1. Response schema

**File**: `backend/app/schemas/bill.py`

**Intent**: Add a small response model for the new endpoint, placed near the other export-related schemas (`BackupTemplate`, `BackupInstance`, `BackupPayload`).

**Contract**: `ExportSummaryOut(BaseModel)` with fields `bill_count: int` and `payment_count: int`.

#### 2. Route handler

**File**: `backend/app/routers/export.py`

**Intent**: Add `GET /export/summary`, run two `COUNT`-style queries scoped to `me.id`, matching `/export/json`'s existing scoping and `is_deleted` exclusion exactly (same join pattern as `export_json`, lines 114-125, but `.count()` instead of `.all()` + serialization).

**Contract**: New route function `export_summary(db, me) -> ExportSummaryOut`, registered on the existing `router` (prefix `/export`), placed after `export_json` and before `restore_json` for readability. No new imports beyond `ExportSummaryOut`.

#### 3. Backend test

**File**: `backend/tests/test_export_xlsx.py` (or a new `backend/tests/test_export_summary.py` — implementer's choice, following whichever keeps the file focused; a new file is preferred since this endpoint is conceptually separate from xlsx generation)

**Intent**: Verify counts match actual live (non-deleted) data, and verify a second user's data never appears in the response — following the `test_export_json_scoped` pattern in `test_user_scoping.py:148`.

**Contract**: At minimum: (a) counts equal the number of bills/live payment instances created for a user, (b) soft-deleted instances are excluded from `payment_count` (mirroring `test_xlsx_excludes_deleted_instances`), (c) a second registered user with their own bills/payments gets a response reflecting only their own data, not the first user's.

### Success Criteria:

#### Automated Verification:

- [ ] Backend test suite passes: `cd backend && uv run pytest tests/ -v`
- [ ] mypy passes: `cd backend && uv run mypy app`
- [ ] black formatting passes: `cd backend && uv run black --check --target-version py313 .`

#### Manual Verification:

- [ ] `GET /export/summary` with a valid session returns `{"bill_count": N, "payment_count": M}` matching what's visible in the dashboard for that user (verified via `http://localhost:8010/docs`)
- [ ] A soft-deleted payment instance (deleted via the UI) does not count toward `payment_count`

---

## Phase 2: Frontend comparison dialog

### Overview

Wire the new endpoint into `RestoreButton.tsx`: validate the picked file client-side, fetch current counts, compute backup counts from the parsed file, and render the comparison + warning in the existing confirmation dialog.

### Changes Required:

#### 1. API client function

**File**: `frontend/src/lib/export-api.ts`

**Intent**: Add a typed fetch for the new endpoint, using `apiFetch` (not a raw `fetch`) so it gets the app's normal 401/session-expiry handling — unlike the pre-existing `restoreFromBackup`, which is left as-is per the out-of-scope note above.

**Contract**: `getExportSummary(): Promise<{ bill_count: number; payment_count: number }>`, calling `apiFetch("/export/summary")`.

#### 2. RestoreButton state and logic

**File**: `frontend/src/components/RestoreButton.tsx`

**Intent**: Extend `handleFileChange` so that, after the existing size check, the file is read as text and `JSON.parse`d; if parsing fails or `bill_templates`/`payment_instances` aren't arrays on the parsed object, set the existing `"error"` state with a new `invalidFile` message and stay in `idle` (never reach `"confirming"`). Otherwise, compute backup counts and export date from the parsed object, call `getExportSummary()` for current counts, and store both in new state alongside `selectedFile` before transitioning to `"confirming"`. If `getExportSummary()` itself fails, still transition to `"confirming"` with the current counts marked unavailable (dialog degrades gracefully rather than blocking restore).

**Contract**: New local state shape carrying `{ backupCounts: {bills, payments}, backupExportedAt: string | null, currentCounts: {bills, payments} | null }` alongside the existing `selectedFile`/`state`/`errorMsg`. The dialog body (lines 101-103 today) gains a comparison block above the existing `dialogDescription` paragraph, and a conditional warning line rendered when `currentCounts` is available and (`backupCounts.bills < currentCounts.bills` or `backupCounts.payments < currentCounts.payments`).

#### 3. Locale strings

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent**: Add new keys under the existing `RestoreButton` object in all three files: a label for "Current" and "Backup" counts, an "export date unknown" fallback string, the stale-data warning line, and an `invalidFile` error message — direct/plain tone matching the existing `dialogDescription`/`error` copy (e.g. English: `"This backup has fewer bills and payments than your current data. Restoring will permanently delete the difference."` / invalid file: `"This file doesn't look like a valid backup."`). Keep all three files strict JSON — no trailing commas — and edit each file's `RestoreButton` object individually (the JSON-locale formatter hook only runs on the file actually edited).

**Contract**: New keys (exact names implementer's choice, consistent across all three locale files): something like `currentLabel`, `backupLabel`, `exportDateUnknown`, `staleDataWarning`, `invalidFile`.

### Success Criteria:

#### Automated Verification:

- [ ] Frontend lint passes: `cd frontend && npm run lint`
- [ ] Frontend build passes: `cd frontend && npm run build`
- [ ] All three locale JSON files parse as valid JSON: `cd frontend && node -e "['en','pl','de'].forEach(l=>require('./messages/'+l+'.json'))"`

#### Manual Verification:

- [ ] Picking a valid backup file shows both current and backup counts plus the backup's export date in the dialog
- [ ] Picking a backup with fewer bills or payments than current shows the warning line
- [ ] Picking a non-JSON file (e.g. rename a `.txt` to `.json`) shows the inline error immediately and never opens the confirmation dialog
- [ ] Picking a valid schema_version 2 backup (no `exported_at`) shows "export date unknown" instead of a blank or crash
- [ ] Verified in both English and Polish (language toggle) that the new copy renders correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: E2E coverage

### Overview

Extend the existing restore e2e spec with the two scenarios this feature exists to catch: a stale/smaller backup triggering the warning, and a malformed file being blocked before the dialog appears.

### Changes Required:

#### 1. Stale-backup warning scenario

**File**: `frontend/tests/e2e/06-export-restore.spec.ts`

**Intent**: New test: create two bills, export a backup, delete one bill (or its payment), then attempt to restore the earlier backup — assert the warning text is visible in the dialog before confirming. Follows the existing test's pattern of using `loginNewUser`/`createBillViaApi` helpers and driving the real file-chooser + dialog UI.

**Contract**: New `test(...)` block in the same file, alongside the existing `test('restore from backup preserves bill count', ...)`.

#### 2. Malformed-file scenario

**File**: `frontend/tests/e2e/06-export-restore.spec.ts`

**Intent**: New test: write a non-JSON temp file with a `.json` extension, pick it via the file chooser, and assert the inline error appears with the dialog (`role="dialog"`) never becoming visible.

**Contract**: New `test(...)` block in the same file.

### Success Criteria:

#### Automated Verification:

- [ ] Full e2e suite passes against the Docker stack: `docker compose up -d --wait --timeout 120 postgres backend frontend demo-data && cd frontend && npx playwright test --reporter=line`

#### Manual Verification:

- [ ] Both new e2e scenarios pass individually when run in isolation (`npx playwright test 06-export-restore --reporter=line`)

---

## Testing Strategy

### Unit Tests:

- Backend: count correctness (bills, live payments) and cross-user scoping for `GET /export/summary`, per Phase 1.

### Integration Tests:

- E2E scenarios (Phase 3): stale-backup warning, malformed-file blocking, plus the existing happy-path round-trip (unchanged).

### Manual Testing Steps:

1. Create 2 bills, export a backup, note the counts shown when re-selecting that same file for restore (should show current == backup, no warning).
2. Delete one bill, then restore the earlier backup — dialog should show the warning line.
3. Rename a plain-text file to `.json`, attempt to restore it — inline error should appear immediately, no dialog.
4. Switch language to Polish, repeat step 2 — warning copy should render in Polish.

## Performance Considerations

None — this adds one lightweight `COUNT`-style query per restore attempt (user-initiated, low frequency) and client-side JSON parsing of a file already capped at 10MB.

## Migration Notes

Not applicable — no schema or model changes.

## References

- Prior audit finding: restore endpoint has no preview/comparison (raised in this conversation's codebase audit).
- Roadmap: `context/foundation/roadmap.md` S-18.
- Sibling change (separate, complementary): `context/changes/restore-auto-backup-safety-net/` (S-19).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend summary endpoint

#### Automated

- [x] 1.1 Backend test suite passes: `cd backend && uv run pytest tests/ -v` — a4ff5ef
- [x] 1.2 mypy passes: `cd backend && uv run mypy app` — a4ff5ef
- [x] 1.3 black formatting passes: `cd backend && uv run black --check --target-version py313 .` — a4ff5ef

#### Manual

- [x] 1.4 `GET /export/summary` returns correct counts matching the dashboard for that user — a4ff5ef
- [x] 1.5 Soft-deleted payment instances excluded from `payment_count` — a4ff5ef

### Phase 2: Frontend comparison dialog

#### Automated

- [x] 2.1 Frontend lint passes: `cd frontend && npm run lint` — a4ff5ef
- [x] 2.2 Frontend build passes: `cd frontend && npm run build` (verified via `docker compose build frontend` — local npm build blocked by a pre-existing, unrelated sandbox environment issue confirmed to also affect unmodified `main`) — a4ff5ef
- [x] 2.3 All three locale JSON files parse as valid JSON — a4ff5ef

#### Manual

- [x] 2.4 Valid backup file shows current and backup counts plus export date — a4ff5ef
- [x] 2.5 Backup with fewer bills/payments than current shows the warning line — a4ff5ef
- [x] 2.6 Non-JSON file shows inline error immediately, dialog never opens — a4ff5ef
- [x] 2.7 schema_version 2 backup (no exported_at) shows "export date unknown" — a4ff5ef
- [x] 2.8 Verified in both English and Polish — a4ff5ef

### Phase 3: E2E coverage

#### Automated

- [x] 3.1 Full e2e suite passes against the Docker stack — a4ff5ef

#### Manual

- [x] 3.2 Both new e2e scenarios pass individually when run in isolation — a4ff5ef
