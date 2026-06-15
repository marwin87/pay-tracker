<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Per-User Data Scoping

- **Plan**: context/changes/per-user-data-scoping/plan.md
- **Scope**: All phases (1–5)
- **Date**: 2026-06-15
- **Verdict**: APPROVED (after triage fixes)
- **Findings**: 0 critical / 3 warnings / 7 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (warnings fixed) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `revert_payment` 403 check after 400 check leaks payment status

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/bills.py:161–166
- **Detail**: Current order in `revert_payment` was: 404 → 400 (status != paid) → 403 (ownership). A cross-user probe of a known `instance_id` gets a 400 if the instance is not paid and a 403 if it is paid — which leaks the payment state to user B. The correct order is: 404 → 403 → 400.
- **Fix**: Moved the `template.user_id != me.id` check to immediately after the 404 check, before the status check.
- **Decision**: FIXED — reordered 404→403→400 in revert_payment

### F2 — `TRUNCATE TABLE bill_templates CASCADE` runs without production guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/alembic/versions/d6fac3b08953_add_user_id_to_bill_templates.py:24
- **Detail**: The TRUNCATE in `upgrade()` is irreversible. If this migration were ever run on a populated database (e.g., after restoring a backup), all bill templates and payment instances would be permanently deleted.
- **Fix**: Added `# DANGER: destroys all data — dev/test only, never run on a populated DB` comment banner and noted downgrade cannot restore truncated rows.
- **Decision**: FIXED — DANGER comment added to migration

### F3 — `_seed_payment` ignores `bill_id` parameter; non-deterministic with multiple bills

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/tests/test_user_scoping.py:27–33
- **Detail**: `_seed_payment(client, token, bill_id)` accepted a `bill_id` arg but never used it. Returns `instances[0]["id"]` which is non-deterministic when a user has multiple bills. Also updated call sites that passed `0` as a placeholder `bill_id`.
- **Fix**: Filter instances by `bill_id` before returning; updated callers to pass the actual bill ID.
- **Decision**: FIXED — helper now filters by bill_id; call sites updated

### F4 — Shared SQLite engine incompatible with pytest-xdist parallel execution

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/tests/conftest.py:19–23
- **Detail**: `_ENGINE` is a module-level singleton using `StaticPool`. Under `pytest-xdist -n auto`, multiple workers sharing this engine would corrupt each other's test state.
- **Fix**: Added comment: `# NOTE: StaticPool singleton — incompatible with pytest-xdist (-n auto).`
- **Decision**: FIXED — comment added

### F5 — Redundant `nullable=False` on `Mapped[int]` column

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/app/models/bill.py:62
- **Detail**: `Mapped[int]` already implies non-nullable in SQLAlchemy 2.0; the explicit `nullable=False` was redundant and inconsistent with other columns.
- **Fix**: Removed `nullable=False` from `mapped_column(ForeignKey("users.id"))`.
- **Decision**: FIXED — redundant arg removed

### F6 — No year range validation on xlsx export

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py:44
- **Detail**: `year` query param typed as `int` (SQL injection safe) but has no range constraint.
- **Fix**: Skipped — household app, not worth guarding this input now.
- **Decision**: SKIPPED

### F7 — `ensure_current_period_instances` commits on every call even with no changes

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — not blocking
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/recurrence.py:97
- **Detail**: `db.commit()` called unconditionally even when no instances were added.
- **Fix**: Wrapped with `if db.new: db.commit()`.
- **Decision**: FIXED — guarded commit with if db.new

### F8 — `test_export_xlsx_scoped` only checks content-type, not empty content

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — not blocking
- **Dimension**: Safety & Quality
- **Location**: backend/tests/test_user_scoping.py:153–164
- **Detail**: Test confirmed download without crash but not that user B's sheets are empty.
- **Fix**: Added openpyxl parse of response bytes; asserts `sheet.max_row <= 1` for all sheets.
- **Decision**: FIXED — XLSX content assertion added

### F9 — CI has no uv dependency caching

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — not blocking
- **Dimension**: Pattern Consistency
- **Location**: .github/workflows/ci.yml:38, 53
- **Detail**: Both backend jobs ran `uv sync --group dev` without caching; every CI run re-downloads from PyPI.
- **Fix**: Added `enable-cache: true` and `cache-dependency-glob: backend/uv.lock` to both `astral-sh/setup-uv@v5` steps.
- **Decision**: FIXED — uv caching enabled in CI

### F10 — `list_bills` and `list_payments` have no pagination

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — not blocking for a household tracker
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/bills.py:25–34, 68–84
- **Detail**: Both endpoints return unbounded result sets. Acceptable at current scale.
- **Fix**: Skipped — future work.
- **Decision**: SKIPPED
