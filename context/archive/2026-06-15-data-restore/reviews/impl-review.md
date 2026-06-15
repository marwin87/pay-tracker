<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Data Restore from Backup

- **Plan**: context/changes/data-restore/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-15
- **Verdict**: APPROVED (post-triage)
- **Findings**: 2 critical, 4 warnings, 1 observation — all FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — No upload size limit (DoS vector)

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py:159
- **Detail**: `await file.read()` with no size cap reads the entire upload into memory before any validation. An authenticated user can POST a multi-gigabyte file to exhaust server memory.
- **Fix**: Cap the read at 10 MB; return 413 if exceeded.
  - Strength: Two-line change at the earliest possible point; no structural impact.
  - Tradeoff: Requires choosing and documenting the limit.
  - Confidence: HIGH — standard practice for file upload endpoints.
  - Blind spot: None significant.
- **Decision**: FIXED

### F2 — Enum coercion after destructive delete (data loss window)

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py:199,219 / backend/app/schemas/bill.py:68,78
- **Detail**: `BillFrequency(bt.frequency)` and `PaymentStatus(bi.status)` are bare Python ValueError raises inside the insert loop, which runs AFTER the bulk deletes. A backup with schema_version=2 but invalid frequency/status strings passes Pydantic (both typed as `str`) and crashes the insert loop mid-way, leaving a data-loss window before the ORM session rolls back.
- **Fix A ⭐ Recommended**: Type `BackupTemplate.frequency` as `BillFrequency` and `BackupInstance.status` as `PaymentStatus` in the Pydantic schemas. Pydantic validates them before any deletes run.
  - Strength: Fixes both the data-loss window and loose schema types at the source. Consistent with how other schemas use enum types in this file.
  - Tradeoff: Invalid enum values in the backup fail loudly (intentional).
  - Confidence: HIGH — idiomatic Pydantic pattern used elsewhere in this codebase.
  - Blind spot: None significant.
- **Fix B**: Wrap insert loop in try/except → explicit db.rollback() + HTTPException(422).
  - Strength: Guarantees immediate rollback regardless of session reuse.
  - Tradeoff: Leaves schema types loose; deletes still run before bad value is caught.
  - Confidence: MEDIUM — solves rollback gap but not root cause.
  - Blind spot: Future ValueError-raising coercions would repeat the same pattern.
- **Decision**: FIXED

### F3 — No MIME-type check on upload

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py:159
- **Detail**: Any file type is accepted at the endpoint level. JSON parse handles non-JSON bytes, but rejecting obviously wrong content types early is better UX and defence-in-depth.
- **Fix**: Check `file.content_type` against `("application/json", "text/plain")` before reading; return 415 if unrecognised.
- **Decision**: FIXED

### F4 — Auth test accepts 401 OR 403 (too loose)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/tests/test_restore.py:158
- **Detail**: `assert r.status_code in (401, 403)` masks future regressions. `app/core/deps.py` raises 401 for missing/invalid tokens. Sibling tests in `test_user_scoping.py` assert exact codes.
- **Fix**: Change to `assert r.status_code == 401`.
- **Decision**: FIXED

### F5 — No client-side file size guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/RestoreButton.tsx:31
- **Detail**: `handleFileChange` transitions directly to "confirming" without checking `file.size`. A user could accidentally upload a large non-backup file before seeing any feedback.
- **Fix**: Add size check in `handleFileChange` with a `fileTooLarge` i18n key and matching error state.
- **Decision**: FIXED

### F6 — Escape key on unfocusable dialog div

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/RestoreButton.tsx:79
- **Detail**: `onKeyDown` for Escape is on the dialog `div` which has no `tabIndex`. Works when Cancel has focus but not during "restoring" state when buttons are disabled.
- **Fix**: Move `onKeyDown` to the Cancel button or both buttons.
- **Decision**: FIXED
