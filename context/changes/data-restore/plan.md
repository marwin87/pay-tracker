# Data Restore from Backup — Implementation Plan

## Overview

Add a restore-from-backup feature: a `POST /export/restore` endpoint that accepts a JSON backup file (produced by `GET /export/json`), wipes the authenticated user's current data, and re-imports the backup atomically. A `RestoreButton` component in the dashboard header mirrors the existing `BackupButton` and presents a two-step confirmation modal before triggering the upload.

## Current State Analysis

The `GET /export/json` endpoint (`backend/app/routers/export.py:90`) produces a `schema_version: 2` JSON file containing `bill_templates` and `payment_instances` arrays with all original DB `id` values. No import or restore endpoint exists. The frontend has `BackupButton.tsx` in the dashboard header (`src/app/dashboard/layout.tsx:85` and `:133`) which follows a state-machine + `createPortal` modal pattern that the RestoreButton will replicate.

### Key Discoveries

- `export.py` is registered as `prefix="/export"` so the restore endpoint naturally lives at `POST /export/restore` in the same file and router without needing a new file.
- The backup's `payment_instances[].bill_id` references original DB IDs. On restore, templates are inserted fresh and get new IDs, so a `{old_id → new_id}` mapping must be built during the insert step before inserting instances.
- `PaymentInstance` has a unique constraint on `(bill_id, period)` — this is satisfied automatically since we delete all existing data first.
- `BillTemplate.user_id` is the isolation boundary; all deletes and inserts must be scoped to `me.id`.
- Deleting `BillTemplate` rows cascades to their `PaymentInstance` rows (check `backend/app/models/bill.py` cascade setting) — if cascade is set, deleting templates is sufficient; otherwise, delete instances first.
- BackupButton translation namespace is `"BackupButton"` in `messages/en.json:164`. RestoreButton gets its own `"RestoreButton"` namespace in all three locale files (`en.json`, `pl.json`, `de.json`).

## Desired End State

A user can click a restore icon button in the dashboard header, pick a `.json` backup file, read a warning that their existing data will be replaced, confirm, and have their account data replaced atomically with the contents of the file. If the file is invalid (wrong schema version, orphaned instances, malformed JSON), the endpoint returns a descriptive 422 and no data is modified.

## What We're NOT Doing

- Schema version migration (v1 → v2 upcast): only `schema_version: 2` files are accepted.
- Merge / deduplication restore mode: the chosen strategy is replace (wipe then import).
- Restoring from XLSX: only the JSON backup format is supported.
- Frontend E2E tests: covered by backend integration tests only.
- A separate settings page: the RestoreButton lives in the existing header alongside BackupButton.

## Implementation Approach

**Backend**: Add a `POST /export/restore` endpoint to the existing `export.py` router. It accepts a `multipart/form-data` upload with a single `file` field. The handler validates the payload, then executes the replace inside a single SQLAlchemy transaction: delete all current user data, insert new templates (capturing the old-ID → new-ID map), insert instances with remapped `bill_id` values.

**Frontend**: New `RestoreButton.tsx` component modelled exactly on `BackupButton.tsx`. State machine: `"idle" | "picking" | "confirming" | "restoring" | "success" | "error"`. Step 1 opens a hidden `<input type="file" accept=".json">` and transitions to "confirming" on selection. Step 2 shows a modal warning with the filename and a destructive-red Confirm button that POSTs via `multipart/form-data`.

## Critical Implementation Details

- **ID remapping is mandatory**: when inserting templates, collect `{backup_template_id: new_db_id}` from each `db.flush()` / `db.add()` call (or insert-then-refresh), then substitute into each instance's `bill_id` before inserting. Failing to do this silently inserts instances referencing stale IDs.
- **Cascade check**: before deleting templates, verify whether `BillTemplate` → `PaymentInstance` has `cascade="all, delete-orphan"`. If it does, one `db.delete(template)` loop suffices. If not, delete all `PaymentInstance` rows first (filter by `bill_id IN (user_template_ids)`), then delete templates.
- **File parsing error surface**: wrap `json.loads(content)` in a try/except and raise `HTTPException(422)` on `JSONDecodeError` — FastAPI won't do this automatically for raw file content.

---

## Phase 1: Backend Restore Endpoint

### Overview

Add `POST /export/restore` to `backend/app/routers/export.py`. The endpoint validates the uploaded JSON file, then atomically replaces the authenticated user's data with the backup contents.

### Changes Required

#### 1. Backup payload Pydantic schemas

**File**: `backend/app/schemas/bill.py`

**Intent**: Add two read-only schemas that model the backup file's inner objects so the restore endpoint can validate and type-check the uploaded payload before touching the DB.

**Contract**: Add `BackupTemplate` and `BackupInstance` models mirroring the fields written by the export endpoint. `BackupTemplate` fields: `id: int`, `name: str`, `category: str | None`, `frequency: str`, `amount: float`, `currency: str`, `due_day: int | None`, `notes: str | None`, `is_archived: bool`, `is_paused: bool`, `start_period: str | None`, `created_at: str`. `BackupInstance` fields: `id: int`, `bill_id: int`, `period: str`, `due_date: str`, `amount: float`, `status: str`, `paid_at: str | None`, `paid_amount: float | None`, `notes: str | None`, `created_at: str`. Add a `BackupPayload` root model: `schema_version: int`, `bill_templates: list[BackupTemplate]`, `payment_instances: list[BackupInstance]`.

#### 2. Restore endpoint

**File**: `backend/app/routers/export.py`

**Intent**: Add `POST /export/restore` that accepts a multipart file upload, validates the backup payload, then within a single transaction deletes all current user data and inserts the backup's templates and instances with remapped IDs.

**Contract**: Route `POST /export/restore`, parameter `file: UploadFile = File(...)`. Steps in order:

1. `content = await file.read()` → `json.loads(content)` (raise `HTTPException(422, "Invalid JSON")` on parse failure).
2. Validate `payload["schema_version"] == 2`; raise `HTTPException(422, "Unsupported schema version")` if not.
3. Parse into `BackupPayload` (raise `HTTPException(422, detail=str(e))` on Pydantic `ValidationError`).
4. Validate that every `instance.bill_id` appears in `{t.id for t in payload.bill_templates}`; raise `HTTPException(422, "Backup contains orphaned payment instances")` if any don't.
5. Inside `db.begin()` (or rely on the existing session transaction):
   - Fetch all current user template IDs. If any exist, `db.query(PaymentInstance).filter(PaymentInstance.bill_id.in_(ids)).delete(synchronize_session=False)`, then `db.query(BillTemplate).filter(BillTemplate.user_id == me.id).delete(synchronize_session=False)`.
   - For each `bt` in `payload.bill_templates`: create a `BillTemplate` ORM object (all fields from backup, `user_id=me.id`, exclude `id` and `created_at`), `db.add(obj)`, `db.flush()` to get `obj.id`, record `id_map[bt.id] = obj.id`.
   - For each `bi` in `payload.payment_instances`: create `PaymentInstance` with `bill_id=id_map[bi.bill_id]` (all other fields from backup, exclude `id` and `created_at`), `db.add(obj)`.
   - `db.commit()`.
6. Return `{"restored_templates": len(payload.bill_templates), "restored_instances": len(payload.payment_instances)}`.

### Success Criteria

#### Automated Verification

- `docker compose exec backend uv run pytest backend/tests/test_restore.py -v` passes
- `docker compose exec backend uv run pytest` (full suite) passes — no regressions

#### Manual Verification

- `POST /export/restore` with a valid backup file returns 200 and correct counts
- `POST /export/restore` with `schema_version: 1` returns 422
- `POST /export/restore` with an instance whose `bill_id` is not in the file returns 422
- After a successful restore, `GET /export/json` returns exactly the restored data
- Unauthenticated `POST /export/restore` returns 401

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Frontend RestoreButton Component

### Overview

Add a `RestoreButton` component that mirrors `BackupButton.tsx` in structure: an icon button in the dashboard header that opens a two-step modal (file picker → destructive confirmation).

### Changes Required

#### 1. Restore API function

**File**: `frontend/src/lib/export-api.ts`

**Intent**: Add `restoreFromBackup(file: File)` that POSTs the file as `multipart/form-data` to `POST /export/restore` and throws on non-2xx responses.

**Contract**:
```ts
export async function restoreFromBackup(file: File): Promise<{ restored_templates: number; restored_instances: number }> {
  const token = getAuthToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/export/restore`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `Restore failed: ${res.status}`);
  }
  return res.json();
}
```

#### 2. RestoreButton component

**File**: `frontend/src/components/RestoreButton.tsx`

**Intent**: A two-step modal component: step 1 triggers a hidden file input (`.json` only) and transitions to step 2 on selection; step 2 shows a destructive-red warning modal with filename and a Confirm button that calls `restoreFromBackup`.

**Contract**: State type `"idle" | "picking" | "confirming" | "restoring" | "error"`. Uses `createPortal(..., document.body)` for the modal (per project rule). Hidden `<input type="file" accept=".json" ref={fileInputRef}>` clicked programmatically on button press. The confirmation modal shows: icon (red `HardDriveUpload` from lucide), dialog title, description including the selected filename, Cancel + Confirm (red) buttons. On error, display the error message from the API response.

#### 3. i18n translation keys

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent**: Add a `"RestoreButton"` namespace with all UI string keys used by the component.

**Contract**: Keys to add under `"RestoreButton"`: `ariaLabel`, `dialogTitle`, `dialogDescription` (template including filename placeholder), `cancel`, `confirm`, `restoring`, `error`, `success` (optional toast-style text).

Suggested English values:
- `ariaLabel`: `"Restore from backup"`
- `dialogTitle`: `"Restore from Backup"`
- `dialogDescription`: `"This will permanently replace all your current data with the contents of \"{filename}\". This action cannot be undone."`
- `cancel`: `"Cancel"`
- `confirm`: `"Replace My Data"`
- `restoring`: `"Restoring…"`
- `error`: `"Restore failed. Please check the file and try again."`

#### 4. Mount RestoreButton in dashboard layout

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Import and render `<RestoreButton />` directly next to `<BackupButton />` in both the desktop header (`div.hidden.md:flex` at line 83) and the mobile menu section (line 132).

**Contract**: Add `import RestoreButton from "@/components/RestoreButton";` and place `<RestoreButton />` immediately after `<BackupButton />` in both locations.

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes with no new errors
- `cd frontend && npm run build` completes successfully (type-check included)

#### Manual Verification

- RestoreButton icon appears in the header next to BackupButton on both desktop and mobile
- Clicking the button opens a file picker (`.json` only)
- Selecting a valid backup JSON advances to the confirmation modal showing the filename
- Pressing Cancel closes the modal without any request
- Pressing "Replace My Data" uploads the file and replaces data (verify with a quick page refresh and bill list check)
- Selecting a file with the wrong schema version shows the API error message in the modal
- Loading state (spinner) visible during the upload

**Implementation Note**: Pause here for manual UI verification before proceeding to Phase 3.

---

## Phase 3: Backend Integration Tests

### Overview

Add `backend/tests/test_restore.py` covering the happy path, validation failure cases, and user isolation.

### Changes Required

#### 1. test_restore.py

**File**: `backend/tests/test_restore.py`

**Intent**: Integration tests using the existing `client` fixture pattern (see `test_user_scoping.py`). Each test registers users, creates data, constructs a backup payload in memory, and POSTs it as a file upload.

**Contract**: Tests to include:

- `test_restore_happy_path`: Register user A with 1 template and 1 seeded payment instance. Download the backup via `GET /export/json`. POST it to `POST /export/restore`. Assert 200 with correct counts. Assert `GET /export/json` returns the same data as the backup.
- `test_restore_wrong_schema_version`: POST a payload with `schema_version: 1`. Assert 422.
- `test_restore_orphaned_instance`: POST a payload where `payment_instances[0].bill_id` references an ID not present in `bill_templates`. Assert 422.
- `test_restore_replaces_existing_data`: Register user A, create 2 templates. Build a backup with 1 template. POST restore. Assert `GET /bills` returns exactly 1 template (the restored one, not the original 2).
- `test_restore_user_isolation`: Register user A and user B. B attempts to restore — asserts that A's data is untouched after B's restore completes.
- `test_restore_requires_auth`: POST `POST /export/restore` without a token. Assert 401 or 403.

Construct the file upload as: `files={"file": ("backup.json", json.dumps(payload).encode(), "application/json")}` in the `client.post()` call.

### Success Criteria

#### Automated Verification

- `docker compose exec backend uv run pytest backend/tests/test_restore.py -v` — all tests green
- `docker compose exec backend uv run pytest` — full suite passes, no regressions

#### Manual Verification

- All 6 test scenarios execute without flakiness on two consecutive runs

---

## Testing Strategy

### Integration Tests

- `backend/tests/test_restore.py` — 6 scenarios: happy path, schema mismatch, orphaned instance, replace semantics, user isolation, auth guard.

### Manual Testing Steps

1. Download a real backup via the BackupButton UI
2. Create a new bill template
3. Restore the backup via the RestoreButton UI
4. Confirm the newly created template is gone and original data is back
5. Try restoring with a hand-edited file where `schema_version` is set to `1` — confirm the error message appears in the modal

## References

- Export router: `backend/app/routers/export.py`
- Bill models: `backend/app/models/bill.py`
- Bill schemas: `backend/app/schemas/bill.py`
- BackupButton (pattern to mirror): `frontend/src/components/BackupButton.tsx`
- Export API client (extend): `frontend/src/lib/export-api.ts`
- Dashboard layout (mount point): `frontend/src/app/dashboard/layout.tsx:83,133`
- Scoping tests (test pattern): `backend/tests/test_user_scoping.py`
- Dialog portal rule: `memory/feedback_dialog_portal.md` — always use `createPortal(..., document.body)`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend Restore Endpoint

#### Automated

- [x] 1.1 `docker compose exec backend uv run pytest backend/tests/test_restore.py -v` passes
- [x] 1.2 `docker compose exec backend uv run pytest` (full suite) passes — no regressions

#### Manual

- [x] 1.3 `POST /export/restore` with valid backup returns 200 and correct counts
- [x] 1.4 `POST /export/restore` with `schema_version: 1` returns 422
- [x] 1.5 `POST /export/restore` with orphaned instance returns 422
- [x] 1.6 After restore, `GET /export/json` returns exactly the restored data
- [x] 1.7 Unauthenticated `POST /export/restore` returns 401

### Phase 2: Frontend RestoreButton Component

#### Automated

- [x] 2.1 `cd frontend && npm run lint` passes with no new errors
- [x] 2.2 `cd frontend && npm run build` completes successfully

#### Manual

- [x] 2.3 RestoreButton icon appears in header next to BackupButton (desktop + mobile)
- [x] 2.4 Clicking button opens file picker (`.json` only)
- [x] 2.5 Selecting file shows confirmation modal with filename
- [x] 2.6 Cancel closes modal without any request
- [x] 2.7 Confirm uploads file and replaces data (verify via page refresh)
- [x] 2.8 Invalid schema version shows API error in modal
- [x] 2.9 Loading spinner visible during upload

### Phase 3: Backend Integration Tests

#### Automated

- [x] 3.1 `docker compose exec backend uv run pytest backend/tests/test_restore.py -v` — all 6 tests green
- [x] 3.2 `docker compose exec backend uv run pytest` — full suite passes

#### Manual

- [x] 3.3 All 6 test scenarios run without flakiness on two consecutive runs
