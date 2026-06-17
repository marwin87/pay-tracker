# Recurrence Unit Tests Implementation Plan

## Overview

Write `backend/tests/test_recurrence_service.py` — a new test file covering all five functions in `backend/app/services/recurrence.py`. No new dependencies, no changes to existing code. Phase 1 covers the three pure functions (no DB) with `@pytest.mark.parametrize`. Phase 2 covers the two DB-bound functions using the SQLite StaticPool pattern already established in `test_reminder_job.py`.

## Current State Analysis

`backend/app/services/recurrence.py` has five functions and zero dedicated tests:

- `_next_period` — pure; converts `"YYYY-MM"` + `BillFrequency` → next `"YYYY-MM"`. Uses `while`-loop month wraparound. No explicit `one_off` branch → returns the same period unchanged (guarded upstream in `generate_next_instance`).
- `_due_date_for_period` — pure; clamps `due_day` to last day of month via `calendar.monthrange`. Handles leap years automatically.
- `_bill_active_in_period` — pure; resolves anchor from `template.start_period` or falls back to `template.created_at.strftime("%Y-%m")` for rows predating the column. `one_off` falls through → returns `False`.
- `generate_next_instance` — DB-bound; guards against `one_off`; application-level idempotency pre-check before INSERT; commits immediately.
- `ensure_current_period_instances` — DB-bound; filters archived/paused/one_off templates; checks active period; idempotency pre-check **does not filter `is_deleted`** — soft-deleted rows are tombstones.

The four existing backend test files (`test_user_scoping.py`, `test_reminder_job.py`, `test_restore.py`, `test_email_service.py`) test HTTP-level and service-level behaviour but none touch `recurrence.py` directly.

Test infrastructure: `test_reminder_job.py` owns the service-level SQLite pattern (module-level `_ENGINE`/`_SessionLocal` with `StaticPool`, `fresh_db` autouse fixture, `_make_bill`/`_make_instance` helpers). Phase 2 replicates this pattern exactly.

## Desired End State

`backend/tests/test_recurrence_service.py` exists with ~25 passing test functions. Running `cd backend && uv run pytest tests/test_recurrence_service.py -v` exits 0. Running the full suite `uv run pytest tests/ -v` also exits 0 (no regressions in existing tests).

The file is organized in two sections: Section 1 (pure tests, no DB) and Section 2 (DB-backed tests). Each section is self-contained — the pure tests can pass without any DB setup.

### Key Discoveries

- `_next_period` and `_due_date_for_period` need only stdlib imports — no model classes, no DB. Expected values for clamping tests must be hardcoded `date(year, month, day)` literals; do not recompute via `calendar.monthrange` in the test assertion (`research.md:91`).
- `_bill_active_in_period` takes a `BillTemplate`-like object but only reads `.frequency`, `.start_period`, `.created_at` — a `types.SimpleNamespace` works perfectly, no SQLAlchemy session needed.
- `generate_next_instance` does NOT check `is_paused` or `is_archived`. That is by design — the router layer is responsible. Tests for paused/archived skip belong to `ensure_current_period_instances`, not `generate_next_instance` (`research.md:248`).
- Soft-delete tombstone invariant (`lessons.md:29–35`): the idempotency pre-check in `ensure_current_period_instances` does not filter `is_deleted`. A row with `is_deleted=True` prevents re-seeding. This must be an explicit test case.
- `BillTemplate` requires a real `User` FK for DB tests. Create a minimal `User` directly with `db.add()` — do not use the HTTP `register_and_login` helper (bypasses HTTP for service-level tests).
- The `created_at` fallback in `_bill_active_in_period` (line 46) is a real production code path for rows where `start_period IS NULL`. Cover it with one `SimpleNamespace` fixture that sets `start_period=None` and a `created_at` datetime.

## What We're NOT Doing

- Not testing the bills router (`mark_paid` endpoint, `ensure_current_period_instances` call site) — that is Phase 4 E2E scope.
- Not migrating the SQLite fixture to PostgreSQL — that is Phase 2 of the test plan rollout (`testing-recurrence-unit` is Phase 1).
- Not modifying `conftest.py` — the new file is fully self-contained.
- Not adding new `pyproject.toml` dependencies — `pytest`, `httpx`, and `sqlalchemy` are already present.
- Not testing reminder-flag fields on `PaymentInstance` (`reminder_sent_upcoming`, etc.) — those belong to `test_reminder_job.py`.
- Not testing `generate_next_instance` with paused or archived templates — that contract belongs to the router layer.

## Implementation Approach

Two-phase split matching the two test categories. Phase 1 delivers immediate value: parametrized pure tests run in milliseconds and require nothing beyond the existing Python environment. Phase 2 adds the SQLite fixture infrastructure and the DB-bound service tests. Both phases write to the same file — Phase 1 creates it with Section 1 only; Phase 2 appends Section 2.

---

## Phase 1: Pure Function Unit Tests

### Overview

Create `backend/tests/test_recurrence_service.py` with Section 1: parametrized tests for `_next_period`, `_due_date_for_period`, and `_bill_active_in_period`. No DB, no SQLAlchemy fixtures, no `conftest.py` changes.

### Changes Required

#### 1. Create `backend/tests/test_recurrence_service.py` — Section 1

**File**: `backend/tests/test_recurrence_service.py`

**Intent**: New test file. Section 1 imports the three private functions directly and tests them with `@pytest.mark.parametrize`. The file header comment explains the two-section structure and links to the research doc.

**Contract**: Top-level imports: `from datetime import date, datetime, timezone`; `import types`; `from app.models.bill import BillFrequency`; `from app.services.recurrence import _next_period, _due_date_for_period, _bill_active_in_period`. Three test functions/classes follow:

`test_next_period` — parametrized over (period, frequency, expected):
- `("2026-01", monthly, "2026-02")` — standard monthly
- `("2026-12", monthly, "2027-01")` — year rollover
- `("2026-11", every_2_months, "2027-01")` — +2 rollover
- `("2026-12", every_2_months, "2027-02")` — +2 from December
- `("2026-10", quarterly, "2027-01")` — +3 from October
- `("2026-11", quarterly, "2027-02")` — +3 from November
- `("2026-12", quarterly, "2027-03")` — +3 from December
- `("2026-01", quarterly, "2026-04")` — standard quarterly
- `("2026-06", annual, "2027-06")` — standard annual
- `("2026-12", annual, "2027-12")` — annual from December
- `("2026-06", one_off, "2026-06")` — invariant: same period returned; comment: "one_off guard in generate_next_instance prevents this path in production"

`test_due_date_for_period` — parametrized over (period, due_day, expected):
- `("2026-02", 31, date(2026, 2, 28))` — non-leap February
- `("2024-02", 31, date(2024, 2, 29))` — leap-year February
- `("2026-04", 31, date(2026, 4, 30))` — April 30 days
- `("2026-11", 31, date(2026, 11, 30))` — November 30 days
- `("2026-01", 31, date(2026, 1, 31))` — January 31 valid
- `("2026-12", 31, date(2026, 12, 31))` — December 31 valid
- `("2026-06", 15, date(2026, 6, 15))` — mid-month, no clamping
- `("2026-06", None, date(2026, 6, 1))` — None → day 1

`test_bill_active_in_period` — parametrized over (frequency, start_period, target_period, expected); uses a `_stub(frequency, start_period)` inner helper returning `types.SimpleNamespace(frequency=frequency, start_period=start_period, created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))`:
- `(monthly, "2026-01", "2026-06", True)` — monthly always active
- `(quarterly, "2026-01", "2026-01", True)` — active at anchor (0 months)
- `(quarterly, "2026-01", "2026-04", True)` — active at +3 months
- `(quarterly, "2026-01", "2026-02", False)` — inactive at +1 month
- `(quarterly, "2026-01", "2025-12", False)` — inactive before anchor
- `(every_2_months, "2026-01", "2026-03", True)` — active at +2 months
- `(every_2_months, "2026-01", "2026-02", False)` — inactive at +1 month
- `(annual, "2026-06", "2027-06", True)` — active at +12 months
- `(annual, "2026-06", "2027-05", False)` — inactive at +11 months
- `(one_off, "2026-01", "2026-01", False)` — one_off always inactive

One additional standalone test `test_bill_active_in_period_created_at_fallback` (not parametrized): construct a stub with `start_period=None` and `created_at=datetime(2026, 1, 15, tzinfo=timezone.utc)`; assert `_bill_active_in_period(stub, "2026-04")` is `True` (quarterly, 3-month offset from anchor "2026-01") and `_bill_active_in_period(stub, "2026-02")` is `False`. This covers the backward-compat code path at `recurrence.py:46`.

### Success Criteria

#### Automated Verification

- All pure tests pass: `cd backend && uv run pytest tests/test_recurrence_service.py -v` exits 0
- Full suite unaffected: `cd backend && uv run pytest tests/ -v` exits 0
- Lint passes: `cd backend && uv run ruff check tests/test_recurrence_service.py` exits 0 (or `flake8` if ruff is absent — check pyproject.toml)

#### Manual Verification

- Test output shows Section 1 test names clearly; all 21 pure test cases visible (11 for `_next_period`, 8 for `_due_date_for_period`, 10 for `_bill_active_in_period`, 1 fallback standalone)
- Pure tests complete in < 0.5 seconds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section.

---

## Phase 2: DB-Backed Service Tests

### Overview

Append Section 2 to `backend/tests/test_recurrence_service.py`: SQLite StaticPool engine, `fresh_db` autouse fixture, `_make_user`/`_make_bill`/`_make_instance` helpers, and tests for `generate_next_instance` and `ensure_current_period_instances`.

### Changes Required

#### 1. Append Section 2 to `backend/tests/test_recurrence_service.py`

**File**: `backend/tests/test_recurrence_service.py`

**Intent**: Add the DB-backed section below Section 1. The section begins with a `# ── Section 2: DB-backed service tests ──` comment, then the engine/session setup, helper functions, and test functions. No new imports needed that aren't already in `test_reminder_job.py`.

**Contract**: Additional imports (append to top of file): `from decimal import Decimal`; `import app.models.bill`; `import app.models.user`; `from sqlalchemy import create_engine`; `from sqlalchemy.orm import sessionmaker`; `from sqlalchemy.pool import StaticPool`; `from app.core.database import Base`; `from app.models.bill import BillTemplate, PaymentInstance, PaymentStatus`; `from app.models.user import User`; `from app.services.recurrence import ensure_current_period_instances, generate_next_instance`.

SQLite engine setup (mirrors `test_reminder_job.py:20–31`): `_DB_ENGINE` with `StaticPool`, `_DBSession = sessionmaker(bind=_DB_ENGINE, autocommit=False, autoflush=False)`.

`@pytest.fixture(autouse=True)` named `fresh_db_s2`: calls `Base.metadata.create_all(bind=_DB_ENGINE)` before each test, `Base.metadata.drop_all(bind=_DB_ENGINE)` after.

Helper functions:
- `_make_user(db) -> User` — creates a minimal `User` with a unique email; `db.add()` + `db.flush()`
- `_make_bill(db, user_id, *, frequency=BillFrequency.monthly, due_day=15, amount=Decimal("100.00"), start_period="2026-01", **kwargs) -> BillTemplate` — creates template; `db.add()` + `db.flush()`
- `_make_instance(db, bill_id, period, *, status=PaymentStatus.upcoming, **kwargs) -> PaymentInstance` — creates instance; `db.add()` + `db.flush()`

`generate_next_instance` tests (4 functions):
- `test_generate_next_instance_monthly_creates_next_period`: monthly template, `paid_period="2026-05"` → returned instance has `period="2026-06"`, `status=upcoming`; re-query from fresh session confirms row exists
- `test_generate_next_instance_one_off_returns_none`: one_off template → returns `None`; re-query confirms 0 `PaymentInstance` rows for that bill
- `test_generate_next_instance_idempotent`: call twice with same args → second call returns same `instance.id`; DB has exactly 1 row for `(bill_id, "2026-06")`
- `test_generate_next_instance_copies_amount_and_due_date`: verify `instance.amount == template.amount` and `instance.due_date == date(2026, 6, 15)` (due_day=15, no clamping)

`ensure_current_period_instances` tests (8 functions):
- `test_ensure_creates_instance_for_active_template`: monthly template → instance created for period `"2026-06"`
- `test_ensure_skips_archived_template`: `is_archived=True` → no instance created
- `test_ensure_skips_paused_template`: `is_paused=True` → no instance created
- `test_ensure_skips_one_off_template`: `frequency=one_off` → no instance created
- `test_ensure_skips_inactive_period`: `frequency=quarterly`, `start_period="2026-01"`, period `"2026-02"` (1-month offset, not divisible by 3) → no instance created
- `test_ensure_idempotent`: call twice → still exactly 1 row; no exception
- `test_ensure_respects_soft_delete_tombstone`: pre-seed instance with `is_deleted=True`; call `ensure_current_period_instances` → no new row created (tombstone respected per `lessons.md:29–35`)
- `test_ensure_scoped_to_user`: User A and User B each have a monthly template; call with `user_id=user_a.id` → only User A's template gets an instance; User B's template has 0 instances

### Success Criteria

#### Automated Verification

- All tests pass: `cd backend && uv run pytest tests/test_recurrence_service.py -v` exits 0 (all ~25 tests)
- Full suite passes: `cd backend && uv run pytest tests/ -v` exits 0
- Lint passes: `cd backend && uv run ruff check tests/test_recurrence_service.py` (or `flake8`) exits 0

#### Manual Verification

- Output shows all 25 test names clearly; no skips; no warnings
- `test_ensure_respects_soft_delete_tombstone` passes — this is the highest-value invariant (verify explicitly in the output)
- `test_generate_next_instance_idempotent` passes — confirm via the test output that the count assertion fires

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before marking Phase 2 complete.

---

## Testing Strategy

### Unit Tests

- `_next_period`: 11 parametrized cases covering all 5 frequency values, year-rollover for monthly/every_2_months/quarterly, and the one_off invariant
- `_due_date_for_period`: 8 parametrized cases covering non-leap Feb, leap Feb, 30-day months, 31-day months, mid-month, and `None` due_day
- `_bill_active_in_period`: 10 parametrized cases + 1 standalone backward-compat test

### Integration Tests (SQLite in-memory)

- `generate_next_instance`: 4 tests covering happy path, one_off guard, idempotency, field correctness
- `ensure_current_period_instances`: 8 tests covering all skip conditions, idempotency, soft-delete tombstone, user scoping

### Manual Testing Steps

1. Run `cd backend && uv run pytest tests/test_recurrence_service.py -v` and confirm ~25 passed, 0 failed, 0 skipped
2. Confirm `test_ensure_respects_soft_delete_tombstone` is visible in the output and green
3. Run `cd backend && uv run pytest tests/ -v` and confirm existing tests still pass (no regressions in `test_user_scoping.py`, `test_reminder_job.py`, etc.)

## References

- Research: `context/changes/testing-recurrence-unit/research.md`
- Function under test: `backend/app/services/recurrence.py`
- Pattern to follow: `backend/tests/test_reminder_job.py:20–130`
- Model definitions: `backend/app/models/bill.py`
- Soft-delete tombstone rule: `context/foundation/lessons.md:29–35`
- Test plan context: `context/foundation/test-plan.md` §3 Phase 1

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pure Function Unit Tests

#### Automated

- [x] 1.1 All pure tests pass: `cd backend && uv run pytest tests/test_recurrence_service.py -v` exits 0
- [x] 1.2 Full suite unaffected: `cd backend && uv run pytest tests/ -v` exits 0
- [x] 1.3 Lint passes on new file: `cd backend && uv run ruff check tests/test_recurrence_service.py` exits 0

#### Manual

- [ ] 1.4 Test output shows 21 pure test cases clearly; all pass in < 0.5 seconds

### Phase 2: DB-Backed Service Tests

#### Automated

- [x] 2.1 All ~25 tests pass: `cd backend && uv run pytest tests/test_recurrence_service.py -v` exits 0
- [x] 2.2 Full suite passes: `cd backend && uv run pytest tests/ -v` exits 0
- [x] 2.3 Lint passes: `cd backend && uv run ruff check tests/test_recurrence_service.py` exits 0

#### Manual

- [ ] 2.4 All ~25 test names visible in output; no skips; no warnings
- [ ] 2.5 `test_ensure_respects_soft_delete_tombstone` explicitly confirmed green in test output
- [ ] 2.6 `test_generate_next_instance_idempotent` explicitly confirmed green in test output
