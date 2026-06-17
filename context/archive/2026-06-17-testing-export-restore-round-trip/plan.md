# Export/Restore Round-Trip Test Coverage Implementation Plan

## Overview

Add integration tests proving that backup→restore is lossless (Risk #5) and that v2 exports restore correctly with missing reminder fields defaulting to `False` (Risk #6). Includes a prerequisite production fix: both export endpoints currently include soft-deleted `PaymentInstance` rows; filter them out first so the tests reflect correct semantics.

## Current State Analysis

All export/restore logic lives in a single file (`backend/app/routers/export.py`). Six integration tests exist in `backend/tests/test_restore.py`; two export scoping tests live in `test_user_scoping.py`. The test infrastructure runs PostgreSQL via testcontainers (Phase 2 migrated from SQLite).

The existing `test_restore_happy_path` does a partial round-trip but compares only array lengths and a single `name` field — it cannot catch field truncation. No test exercises v2 backward compatibility or XLSX row counts.

### Key Discoveries

- `backend/app/routers/export.py:100-106` — JSON export query fetches `PaymentInstance` rows without filtering `is_deleted` — soft-deleted instances leak into backups
- `backend/app/routers/export.py:41-50` — XLSX export query has the same gap
- `backend/app/schemas/bill.py:94-95` — `BackupInstance.reminder_sent_upcoming` and `reminder_sent_overdue` carry Pydantic `= False` defaults; v2 payloads missing these keys are silently accepted with `False`
- `backend/app/routers/export.py:202-219` — IDs are remapped on restore; `bill_id` in `PaymentInstance` is updated via `id_map`; round-trip comparison must exclude both `id` and `bill_id`
- `backend/tests/conftest.py:19-23` — Session-scoped `PostgresContainer("postgres:17")` engine; `client` fixture drops/creates tables per test — all new tests get a clean DB

## Desired End State

After this change:
- Both export endpoints return only live (non-deleted) instances
- A seed→export→restore→re-export cycle produces identical field values for all exported schema fields (excluding auto-generated ids)
- A v2-format backup (missing reminder fields) restores with `reminder_sent_upcoming = False` and `reminder_sent_overdue = False`; a v3 backup with those fields set to `True` preserves them
- The XLSX export row count for a given year equals the number of live (non-deleted) instances in that year
- All assertions in the `## Progress` section pass

## What We're NOT Doing

- Not adding tests for schema-version rejection, orphaned-instance validation, user isolation, or auth guards — these are already covered
- Not testing the XLSX column values in depth — row count is sufficient to catch silent drops
- Not migrating to a v4 schema — no new fields are being added
- Not testing XLSX column formatting or sheet naming

## Implementation Approach

Phase 1 makes a minimal production fix (two filter additions). Phases 2–3 layer new integration tests on top, following the exact patterns already established in `test_restore.py`.

## Critical Implementation Details

**ID remapping in round-trip comparison:** Restore assigns new DB-generated ids to all rows. Round-trip comparison for `bill_templates` must exclude `id`; for `payment_instances` must exclude both `id` and `bill_id`. Sort by a stable key before comparing: templates by `name`, instances by `(period, amount)` — design test seeds to make these unique.

**True v2 payload shape:** `_make_backup()` accepts arbitrary instance dicts. A true v2 test must pass instance dicts that **omit** `reminder_sent_upcoming` and `reminder_sent_overdue` — adding those keys (even to a `schema_version: 2` payload) causes Pydantic to use the provided values, not the defaults. The omission is what triggers the default path.

**XLSX sheet layout:** The exporter always creates 12 sheets (Jan–Dec), even for months with no data. Empty months are written as header-only sheets (`max_row == 1` in openpyxl). Total data rows = `sum(ws.max_row - 1 for ws in wb.worksheets)`.

---

## Phase 1: Fix Export is_deleted Filters

### Overview

Add `is_deleted == False` filter to both JSON and XLSX export queries so soft-deleted `PaymentInstance` rows are excluded from all exports. This is a prerequisite for semantically correct round-trip tests.

### Changes Required

#### 1. XLSX export query

**File:** `backend/app/routers/export.py`

**Intent:** The XLSX query at lines 41-50 fetches `PaymentInstance` rows joined to `BillTemplate` for user scoping. Add an `is_deleted` filter so soft-deleted instances are excluded from the spreadsheet, consistent with how the payments list endpoint (`GET /bills/payments`) works.

**Contract:** Add `.filter(PaymentInstance.is_deleted.is_(False))` to the SQLAlchemy query, alongside the existing `user_id` join filter and `period.startswith` year filter.

#### 2. JSON export query

**File:** `backend/app/routers/export.py`

**Intent:** The JSON export query at lines 100-106 fetches instances via `bill_id.in_(template_ids)`. Add an `is_deleted` filter so soft-deleted instances are excluded from the backup, consistent with the XLSX fix above.

**Contract:** Add `.filter(PaymentInstance.is_deleted.is_(False))` to the SQLAlchemy query alongside the existing `bill_id.in_()` filter.

### Success Criteria

#### Automated Verification

- All existing pytest tests pass: `docker compose exec backend uv run pytest backend/tests/ -q`

#### Manual Verification

- No manual verification needed; correctness is proven by Phase 2/3 tests

---

## Phase 2: JSON Round-Trip and Backward-Compat Tests

### Overview

Add three tests to `backend/tests/test_restore.py` covering: (a) field-level round-trip losslessness (Risk #5), (b) v2 backup restores with `False` defaults for missing reminder fields (Risk #6), and (c) v3 backup preserves `True` reminder flags through restore.

### Changes Required

#### 1. Field-level round-trip test

**File:** `backend/tests/test_restore.py`

**Intent:** Test `test_round_trip_field_level` — seeds two templates with distinct fields (including notes and currency variations), triggers payment instance generation via `GET /bills/payments`, marks one instance as paid (to exercise `paid_at`, `paid_amount`), captures the export, restores it, re-exports, and compares every v3 schema field for both templates and instances.

**Contract:** 
- Template comparison: exclude `id`; sort by `name`; assert each remaining field matches
- Instance comparison: exclude `id` and `bill_id`; sort by `(period, amount)`; assert each remaining field matches (including `reminder_sent_upcoming`, `reminder_sent_overdue`, `paid_at`, `paid_amount`, `notes`)
- Assert `restored_templates` and `restored_instances` in the restore response equal the backup list lengths

For marking a payment paid, use the existing endpoint pattern from `test_user_scoping.py` — call `PATCH /bills/payments/{id}` or the equivalent mark-paid route discovered during Phase 2.

#### 2. v2 backward-compat test

**File:** `backend/tests/test_restore.py`

**Intent:** Test `test_v2_backup_defaults_reminder_fields` — constructs a `schema_version: 2` payload using `_make_backup()` with a hand-crafted instance dict that **omits** `reminder_sent_upcoming` and `reminder_sent_overdue`. After restore, re-exports and asserts both fields are `False` on every restored instance.

**Contract:** The instance dict passed to `_make_backup()` must not include the reminder keys. After restore, call `GET /export/json` and for each instance in the response assert `reminder_sent_upcoming == False` and `reminder_sent_overdue == False`.

#### 3. v3 reminder-flag preservation test

**File:** `backend/tests/test_restore.py`

**Intent:** Test `test_v3_backup_preserves_reminder_flags` — constructs a `schema_version: 3` payload (or uses a live export after explicitly setting reminder flags) with `reminder_sent_upcoming: True`. After restore, re-exports and asserts the flag is preserved.

**Contract:** The simplest approach: seed a template and instance via the API, then directly update `reminder_sent_upcoming` to `True` in the DB via `db_session` fixture (or use any existing endpoint that sets the flag), export, restore, re-export, assert the flag survives. Alternatively, construct the payload manually with `"reminder_sent_upcoming": True` in the instance dict and `schema_version: 3`.

#### 4. Helper for building typed instance dicts

**File:** `backend/tests/test_restore.py`

**Intent:** Extract a `_make_instance_dict(template_id, period, *, include_reminder_fields=True, reminder_sent_upcoming=False, reminder_sent_overdue=False, **overrides)` helper to avoid repeating the full instance field list in tests 2 and 3.

**Contract:** Returns a dict with all `BackupInstance` fields populated with safe defaults. Callers can pass `include_reminder_fields=False` to omit the reminder keys entirely (producing a true v2-shape dict).

### Success Criteria

#### Automated Verification

- All tests in `test_restore.py` pass (existing 6 + new 3): `docker compose exec backend uv run pytest backend/tests/test_restore.py -v`
- Full test suite passes: `docker compose exec backend uv run pytest backend/tests/ -q`

#### Manual Verification

- None required; all assertions are automated

---

## Phase 3: XLSX Row-Count Test

### Overview

Add a new test file `backend/tests/test_export_xlsx.py` with two tests: one verifying that the XLSX row count matches the number of live instances for a given year, and one verifying that soft-deleted instances are excluded (directly exercising the Phase 1 fix on the XLSX path).

### Changes Required

#### 1. XLSX row-count test

**File:** `backend/tests/test_export_xlsx.py` (new file)

**Intent:** Test `test_xlsx_row_count_matches_live_instances` — seeds two monthly templates, triggers instance generation for the current year, calls `GET /export/xlsx` (defaulting to current year), parses the returned workbook with `openpyxl`, sums data rows across all 12 sheets, and asserts the total equals the number of seeded live instances.

**Contract:** Parse the workbook from the response bytes with `openpyxl.load_workbook(io.BytesIO(response.content))`. Total data rows: `sum(ws.max_row - 1 for ws in wb.worksheets)` (empty months contribute 0; header row subtracted). Import `io` and `openpyxl` at the top of the file; `openpyxl` is already a backend production dependency.

#### 2. XLSX excludes deleted instances

**File:** `backend/tests/test_export_xlsx.py`

**Intent:** Test `test_xlsx_excludes_deleted_instances` — seeds one template, triggers instance generation, deletes one instance via the delete endpoint, calls `GET /export/xlsx`, and asserts the deleted instance's row is absent (total data rows == live instances, not total instances).

**Contract:** Use the delete endpoint identified during Phase 2 IDOR research (`DELETE /bills/payments/{instance_id}` or equivalent). After deletion, `GET /export/xlsx` data rows must equal `(total instances) - 1`.

### Success Criteria

#### Automated Verification

- New XLSX tests pass: `docker compose exec backend uv run pytest backend/tests/test_export_xlsx.py -v`
- Full test suite passes: `docker compose exec backend uv run pytest backend/tests/ -q`

#### Manual Verification

- None required; all assertions are automated

---

## Testing Strategy

### Integration Tests

The entire change is integration-test-based. Every test runs against a real PostgreSQL container (session-scoped, schema-dropped/created per test via the `client` fixture).

### Edge Cases Explicitly Covered

- Round-trip with paid instance (exercises `paid_at`, `paid_amount`, status=`paid`)
- v2 payload with missing reminder fields → `False` defaults (not null, not error)
- v3 payload with `reminder_sent_upcoming=True` → survives restore unchanged
- Soft-deleted instance excluded from JSON export (implicitly proven by round-trip: delete an instance, export, restore, re-export, count matches)
- Soft-deleted instance excluded from XLSX export (explicit Phase 3 test)

## References

- Research: `context/changes/testing-export-restore-round-trip/research.md`
- Export/restore router: `backend/app/routers/export.py:35-243`
- BackupPayload schema: `backend/app/schemas/bill.py:83-101`
- PaymentInstance model: `backend/app/models/bill.py:73-116`
- Existing restore tests: `backend/tests/test_restore.py`
- Test fixtures: `backend/tests/conftest.py`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fix Export is_deleted Filters

#### Automated

- [x] 1.1 All existing pytest tests pass after filter additions

### Phase 2: JSON Round-Trip and Backward-Compat Tests

#### Automated

- [x] 2.1 `test_round_trip_field_level` passes
- [x] 2.2 `test_v2_backup_defaults_reminder_fields` passes
- [x] 2.3 `test_v3_backup_preserves_reminder_flags` passes
- [x] 2.4 Full `test_restore.py` suite passes (all 9 tests)
- [x] 2.5 Full test suite passes

### Phase 3: XLSX Row-Count Test

#### Automated

- [x] 3.1 `test_xlsx_row_count_matches_live_instances` passes
- [x] 3.2 `test_xlsx_excludes_deleted_instances` passes
- [x] 3.3 Full test suite passes
