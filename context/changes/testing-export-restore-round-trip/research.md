---
date: 2026-06-17T11:20:03+0000
researcher: claude-sonnet-4-6
git_commit: b6f5d7e21f40fad800f25e03a5c4fa4720677ce2
branch: main
repository: pay-tracker
topic: "Export/restore round-trip test coverage — Risks #5 and #6"
tags: [research, export, restore, backup, schema_version, integration-tests]
status: complete
last_updated: 2026-06-17
last_updated_by: claude-sonnet-4-6
---

# Research: Export/Restore Round-Trip Test Coverage

**Date**: 2026-06-17T11:20:03+0000
**Researcher**: claude-sonnet-4-6
**Git Commit**: b6f5d7e21f40fad800f25e03a5c4fa4720677ce2
**Branch**: main
**Repository**: pay-tracker

## Research Question

What does the export/restore implementation look like, what existing tests cover it, and what gaps remain to fully protect Risks #5 and #6 from the test plan?

## Summary

The export/restore feature is implemented entirely in `backend/app/routers/export.py`. There are already 6 integration tests in `backend/tests/test_restore.py` and 2 scoping tests in `test_user_scoping.py`. The existing tests use `schema_version: 2` fixtures only and assert status codes + response counts — they **do not** verify row-level field completeness or backward-compat defaults for v2 fields. Key gaps: no seed→export→restore→compare round-trip (Risk #5), no v2-backup fixture test proving reminder fields default to `False` (Risk #6), and the export silently includes `is_deleted=True` instances.

---

## Detailed Findings

### JSON Export Endpoint

**File:** `backend/app/routers/export.py:93-152`  
**Route:** `GET /export/json`

- Hard-codes `schema_version: 3` (line 108)
- Scopes to authenticated user: templates where `user_id == me.id`, then instances via `bill_id.in_(template_ids)` (lines 98-105)
- Serializes **12 template fields** (id, name, category, frequency, amount, currency, due_day, notes, is_archived, is_paused, start_period, created_at) and **13 instance fields** (id, bill_id, period, due_date, amount, status, paid_at, paid_amount, notes, created_at, reminder_sent_upcoming, reminder_sent_overdue, plus missing is_deleted — see gaps)
- Download filename: `pay-tracker-backup-{YYYY-MM-DD}.json`

**Critical gap — `is_deleted` not filtered:** The JSON export query does not filter `PaymentInstance.is_deleted == False`. Soft-deleted instances are included in the backup. The `BackupInstance` schema has no `is_deleted` field, so this state is silently lost on restore — deleted instances come back as non-deleted.

### XLSX Export Endpoint

**File:** `backend/app/routers/export.py:35-90`  
**Route:** `GET /export/xlsx`  
**Query param:** `year` (defaults to current year)

- Joins on BillTemplate for user scoping (line 44-46)
- Filters by `period.startswith(f"{year}-")` (line 47)
- Also does **not** filter `is_deleted` — deleted instances appear in the spreadsheet
- Produces 12 sheets (one per month); empty months get header-only sheets
- 10 columns: Bill, Category, Period, Due Date, Amount, Currency, Status, Paid Amount, Paid At, Notes

### Restore Endpoint

**File:** `backend/app/routers/export.py:155-243`  
**Route:** `POST /export/restore`

**Validation pipeline (in order):**
1. Content-type check — accepts `application/json`, `text/plain`, `application/octet-stream`
2. Size limit: 10 MB (line 164-167)
3. JSON parse (line 168-171)
4. `schema_version in {2, 3}` guard (line 173-174)
5. Pydantic `BackupPayload.model_validate(raw)` (line 177)
6. Orphaned instance check — all `bill_id` values must reference a template in the backup (lines 181-188)

**Restore strategy: full replace (not upsert/merge):**
- Deletes all existing `PaymentInstance` rows for the user (lines 195-197)
- Deletes all existing `BillTemplate` rows for the user (lines 198-200)
- Inserts templates, building `id_map: dict[int, int]` (old ID → new DB-generated ID) (lines 202-219)
- Inserts instances, remapping `bill_id` via `id_map` (lines 221-236)
- All restored templates get `user_id = me.id` (line 215)

**Row count response (lines 240-243):**
```json
{"restored_templates": N, "restored_instances": M}
```
Counts are taken from `len(backup.bill_templates)` and `len(backup.payment_instances)` — i.e., from the backup, not from the DB INSERT confirmation. If an insert silently failed, the count would still show the backup value.

### Schema Version Guard (v2 → v3)

**BackupInstance schema:** `backend/app/schemas/bill.py:83-95`

The v2→v3 transition added two reminder fields to `PaymentInstance`:
- `reminder_sent_upcoming: bool = False`
- `reminder_sent_overdue: bool = False`

These fields carry Pydantic defaults. When a v2 backup (missing these keys) is validated via `BackupPayload.model_validate(raw)`, Pydantic silently supplies `False` for both — no error is raised and no log is emitted. The restore then writes these `False` values to the DB.

**Two additional reminder fields exist in the DB model but are NOT in the backup schema:**
- `reminder_sent_2_days_before` (model line 103) — always restored as DB default `False`
- `reminder_sent_on_day` (model line 106) — always restored as DB default `False`
- `email_sent_at` (model line 109) — never backed up

This is intentional for v3 (these fields were added but not included in the export), but it means a restore of a v3 backup also silently loses the state of these four fields.

### Existing Test Coverage

**`backend/tests/test_restore.py` (6 tests):**

| Test | What it asserts | Gap |
|------|-----------------|-----|
| `test_restore_happy_path` (line 50) | Status 200, response counts match backup, re-export JSON matches restored data | Uses `schema_version: 2` fixture; does not assert field-level equality (only status codes + counts in the re-export check) |
| `test_restore_wrong_schema_version` (line 71) | Status 422 for v1 payload | Correct |
| `test_restore_orphaned_instance` (line 81) | Status 422 when bill_id not in templates | Correct |
| `test_restore_replaces_existing_data` (line 97) | Status 200; original 2 templates replaced by 1 restored template | Good semantic test; no field-level check |
| `test_restore_user_isolation` (line 134) | User A's data untouched after User B restores | Correct |
| `test_restore_requires_auth` (line 150) | Status 401 without token | Correct |

**`backend/tests/test_user_scoping.py` (2 tests, lines 147-182):**
- `test_export_json_scoped`: asserts status, `schema_version == 3`, `exported_by` == user email, empty arrays for isolated user
- `test_export_xlsx_scoped`: asserts status, content-type header, header-only sheets for isolated user

**No fixture backup files exist.** All tests construct payloads programmatically via `_make_backup()` helper and live `GET /export/json` calls.

### Archive Context

- `context/archive/2026-06-15-data-restore/` — full implementation plan; confirms: replace (not merge) strategy, ID remapping, cascade delete design, and that schema_version guard was explicitly planned
- `context/archive/2026-06-15-data-backup/` — original backup plan; initial schema v1 spec shows how fields evolved to v3
- `context/archive/2026-06-16-email-reminders/` — added `reminder_sent_upcoming` / `reminder_sent_overdue` fields and bumped schema to v3; the v2→v3 gap was intentional

---

## Code References

- `backend/app/routers/export.py:35-90` — XLSX export endpoint
- `backend/app/routers/export.py:93-152` — JSON export endpoint; `schema_version: 3` at line 108
- `backend/app/routers/export.py:155-243` — Restore endpoint; version guard at line 173; replace strategy at lines 194-200; id_map at lines 202-219; row count response at lines 240-243
- `backend/app/schemas/bill.py:68-101` — BackupTemplate, BackupInstance, BackupPayload schemas; Pydantic defaults for reminder fields at lines 94-95
- `backend/app/models/bill.py:73-116` — PaymentInstance model; `is_deleted` at line 94; reminder fields at lines 97-108; unique constraint `(bill_id, period)` at line 114
- `backend/tests/test_restore.py:1-159` — all existing restore tests; `_make_backup()` helper at lines ~30-48; uses `schema_version: 2`
- `backend/tests/test_user_scoping.py:147-182` — export scoping tests

---

## Architecture Insights

1. **Single-file implementation:** All three export/restore routes live in one file (`export.py`). No service layer — business logic is inline in the router. Tests will interact directly with the HTTP endpoints.

2. **Full-replace semantics:** Restore is destructive. The test strategy must account for this: seed → export → clear-implicitly-via-restore → compare. The "clear" step is free because restore wipes the DB before inserting.

3. **Counts come from backup, not DB:** `restored_instances` in the response counts `len(backup.payment_instances)`, not actual DB inserts. A row-level equality check after restore (re-export and compare) is the only reliable way to verify nothing was silently dropped.

4. **No fixture files — tests build payloads programmatically:** The existing `_make_backup()` pattern can be extended to produce v2-shaped payloads (omit reminder fields) for the backward-compat tests.

5. **`is_deleted` leaks into exports:** Both export endpoints miss `is_deleted = False` filter. A seed→export→restore round-trip test will import deleted instances as live ones. The test must decide whether to treat this as a bug to assert or a known limitation to accept. The test plan (Risk #5) requires "same ids, amounts, periods, statuses" — soft-deleted rows would violate this expectation.

---

## Historical Context (from prior changes)

- `context/archive/2026-06-15-data-restore/plan.md` — documented replace strategy and ID remapping; confirms current implementation matches original design
- `context/archive/2026-06-16-email-reminders/` — v2→v3 schema bump; reminder fields added with `server_default="false"` making the Pydantic-defaults approach correct

---

## Open Questions

1. **`is_deleted` in export — bug or by design?** The test plan says restore should produce "same ids, amounts, periods, statuses." If soft-deleted instances are included in the export and then restored as non-deleted, this is a correctness gap. Plan phase should decide: fix the export filter (add `is_deleted == False`) or acknowledge it as out-of-scope for Phase 3.

2. **Row-count response vs actual DB count:** The response counts backup length, not DB inserts. Should the round-trip test compare `len(seeded_instances) == restored_instances_count == re-exported_instances_count`? Yes — that is the cheapest way to catch a silent drop.

3. **v2 fixture format:** The existing `_make_backup()` uses `schema_version: 2` but **does include** `reminder_sent_upcoming` and `reminder_sent_overdue`. A true v2 fixture must omit them. The plan should add a separate `_make_v2_backup()` helper that omits those keys.

4. **`exported_by` / `exported_at` not in BackupPayload schema:** These metadata fields are present in the JSON export output but are not part of `BackupPayload`. They are silently ignored on restore — which is correct, but should be explicitly noted in the tests.
