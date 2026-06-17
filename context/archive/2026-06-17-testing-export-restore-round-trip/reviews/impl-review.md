<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Export/Restore Round-Trip Test Coverage

- **Plan**: `context/changes/testing-export-restore-round-trip/plan.md`
- **Scope**: All 3 phases (full plan)
- **Date**: 2026-06-17
- **Verdict**: APPROVED (all findings triaged and fixed)
- **Findings**: 0 critical  4 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (86/86 tests after triage fixes) |

## Findings

### F1 — _data_rows expression is misleading and fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `backend/tests/test_export_xlsx.py:34`
- **Detail**: `(ws.max_row or 1) - 1` dead-code guard; a future edit to `or 0` silently produces -1 for empty sheets.
- **Fix**: Replaced with `sum(ws.max_row - 1 for ws in wb.worksheets if ws.max_row and ws.max_row > 1)`
- **Decision**: FIXED

### F2 — No test for "one deleted + one live → exactly 1 XLSX row"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `backend/tests/test_export_xlsx.py:59-76`
- **Detail**: No test proved the is_deleted filter is scoped (not blanket); a blanket-drop bug would pass both existing tests.
- **Fix A ⭐ Applied**: Added `test_xlsx_partial_deletion` — seeds 2 bills, deletes one, asserts `_data_rows == 1`.
- **Decision**: FIXED via Fix A

### F3 — Instance sort key in round-trip test is fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `backend/tests/test_restore.py:265-274`
- **Detail**: Sort key `(period, amount)` — collision if two instances share same period and amount.
- **Fix**: Extended to `(period, amount, status)`.
- **Decision**: FIXED

### F4 — Round-trip field loop passes trivially if n_instances == 0

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `backend/tests/test_restore.py:247-248`
- **Detail**: zip loop iterates over nothing if export returns empty list.
- **Fix**: Added `assert n_instances >= 2` after line 248.
- **Decision**: FIXED

### F5 — v2 compat test missing restored_instances count assertion

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `backend/tests/test_restore.py:304-305`
- **Detail**: Status 200 asserted but not response count.
- **Fix**: Added `assert r.json()["restored_instances"] == 1`.
- **Decision**: FIXED

### F6 — Three reminder/notification columns intentionally absent from backup

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `backend/app/schemas/bill.py:83` (pre-existing)
- **Detail**: `reminder_sent_2_days_before`, `reminder_sent_on_day`, `email_sent_at` silently reset on restore.
- **Fix**: Added comment in `BackupInstance` documenting which fields are deliberately excluded.
- **Decision**: FIXED

### F7 — year parameter has no bounds validation

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `backend/app/routers/export.py:37` (pre-existing)
- **Detail**: Accepts any integer; no injection risk but no bounds guard.
- **Decision**: SKIPPED
