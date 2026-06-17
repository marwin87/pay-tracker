---
date: 2026-06-17T08:27:31Z
researcher: claude-sonnet-4-6
git_commit: 8b8900d95a6be14c479b3fcdeae40e819704b5ce
branch: main
repository: pay-tracker
topic: "Recurrence unit tests — period math and next-instance generation"
tags: [research, recurrence, unit-tests, period-math, idempotency, testing]
status: complete
last_updated: 2026-06-17
last_updated_by: claude-sonnet-4-6
---

# Research: Recurrence Unit Tests — Period Math and Next-Instance Generation

**Date**: 2026-06-17T08:27:31Z
**Researcher**: claude-sonnet-4-6
**Git Commit**: 8b8900d95a6be14c479b3fcdeae40e819704b5ce
**Branch**: main
**Repository**: pay-tracker

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`: "Recurrence unit tests".

Risks to verify:
- **Risk #1**: Mark-paid silently fails to create next-period instance.
- **Risk #2**: Period math produces wrong due date at month boundaries.

Verify or correct the risk response guidance; locate existing tests; identify the cheapest useful test layer; flag speculative risks or misleading evidence.

---

## Summary

`backend/app/services/recurrence.py` contains five functions. Three are **pure functions with no DB dependency** — `_next_period`, `_due_date_for_period`, and `_bill_active_in_period` — testable with `@pytest.mark.parametrize`, zero fixtures, zero DB. Two require a DB session — `generate_next_instance` and `ensure_current_period_instances` — and should follow the SQLite `_SessionLocal` fixture pattern already established in `test_reminder_job.py`.

**Risk #1 is testable and well-scoped.** `generate_next_instance` is the direct entry point. It has two load-bearing guards that must be tested beyond happy-path: the `one_off` early-return guard and the idempotency pre-check. Critically, `generate_next_instance` does NOT check `is_paused` or `is_archived` — those checks live only in `ensure_current_period_instances`. The router calls `generate_next_instance` directly after `mark_paid`; the paused check is the router's responsibility, not the service's. Both `generate_next_instance` and `ensure_current_period_instances` should be tested.

**Risk #2 is testable with pure parametrized tests.** `_due_date_for_period` uses Python's `calendar.monthrange` stdlib function for leap-year and month-end clamping — the oracle for expected values must come from independent `date()` construction, never from re-running the formula. `_next_period` has no explicit `one_off` case — a one_off input falls through and increments month by 1 as if monthly. This is a latent bug but not a real risk in normal flow because `generate_next_instance` guards against `one_off` before calling `_next_period`. Document this invariant in the test.

**Existing test infrastructure is SQLite-based.** The `test_reminder_job.py` pattern (SQLite in-memory StaticPool, `fresh_db` autouse fixture, `_make_bill`/`_make_instance` helpers, commit → close → reopen → query-by-id) is the model to follow for DB-level tests. The risk-plan concern about SQLite/PostgreSQL divergence (Risk #4 in the test plan) is real but deferred to Phase 2 — Phase 1 only adds pure unit tests and the existing SQLite-based pattern for DB tests.

**New test file**: `backend/tests/test_recurrence_service.py`.

---

## Detailed Findings

### Function-by-Function Analysis

#### `_next_period(period, frequency)` — pure function, no DB

`backend/app/services/recurrence.py:9–28`

- Parses `period` as `"YYYY-MM"` string, returns a new `"YYYY-MM"` string.
- Handles `monthly` (+1), `every_2_months` (+2), `quarterly` (+3), `annual` (+12 to year only).
- Month wraparound uses a `while` loop (lines 18, 23) — correctly handles cases like `quarterly` from October (14 → 2, year +1) and `every_2_months` from December (14 → 2, year +1).
- **No explicit `one_off` case.** A `one_off` input falls through all conditionals and returns the original period string with `month` still unparsed — actually it returns the string after only setting `year, month = map(int, period.split("-"))` without modifying them, then hitting `return f"{year:04d}-{month:02d}"`. Wait — re-checking: the logic is `if monthly → month += 1 / elif every_2_months → ... / elif quarterly → ... / elif annual → year += 1 / return`. For `one_off`, none of the branches match, so `year` and `month` stay at the parsed values and the same period is returned unchanged. This means `_next_period("2026-06", BillFrequency.one_off)` returns `"2026-06"` — the same period, not an increment. This is a different (and arguably more sensible) silent behavior than previously noted.
- **Invariant**: `generate_next_instance` guards against `one_off` at line 105–106 before ever calling `_next_period`, so this edge case never fires in normal production flow.

**Critical edge cases to test:**
- `monthly` + `"2026-12"` → `"2027-01"` (year rollover)
- `every_2_months` + `"2026-12"` → `"2027-02"` (rollover with +2)
- `quarterly` + `"2026-10"` → `"2027-01"` (rollover with +3)
- `quarterly` + `"2026-11"` → `"2027-02"`
- `quarterly` + `"2026-12"` → `"2027-03"`
- `annual` + `"2026-06"` → `"2027-06"`
- `annual` + `"2026-12"` → `"2027-12"`
- `one_off` + `"2026-06"` → `"2026-06"` (same period returned, no increment)

#### `_due_date_for_period(period, due_day)` — pure function, no DB

`backend/app/services/recurrence.py:31–36`

- Uses `calendar.monthrange(year, month)[1]` to get the last day of the month.
- Returns `date(year, month, min(day, last_day))`.
- `due_day=None` defaults to `day=1` (line 33).
- Leap year handled automatically by `monthrange`.

**Critical edge cases to test — expected values derived independently:**
- `("2026-02", 31)` → `date(2026, 2, 28)` — non-leap February
- `("2024-02", 31)` → `date(2024, 2, 29)` — leap-year February
- `("2026-04", 31)` → `date(2026, 4, 30)` — April has 30 days
- `("2026-01", 31)` → `date(2026, 1, 31)` — January 31 is valid
- `("2026-06", 15)` → `date(2026, 6, 15)` — mid-month, no clamping
- `("2026-06", None)` → `date(2026, 6, 1)` — None defaults to day 1
- `("2026-12", 31)` → `date(2026, 12, 31)` — December 31 is valid
- `("2026-11", 31)` → `date(2026, 11, 30)` — November has 30 days

**Anti-pattern**: do not compute expected values via `_due_date_for_period` itself or `calendar.monthrange` in the test. Hardcode `date(year, month, day)` as expected values.

#### `_bill_active_in_period(template, period)` — pure function, needs BillTemplate object

`backend/app/services/recurrence.py:39–61`

- `monthly` returns `True` immediately (line 41–42) — no anchor calculation needed.
- Anchor: prefers `template.start_period` (YYYY-MM string); falls back to `template.created_at.strftime("%Y-%m")`.
- Calculates `months_diff = (target_year - start_year) * 12 + (target_month - start_month)`.
- Returns `False` if `months_diff < 0` (period before anchor).
- Returns `True` for `every_2_months` iff `months_diff % 2 == 0`.
- Returns `True` for `quarterly` iff `months_diff % 3 == 0`.
- Returns `True` for `annual` iff `months_diff % 12 == 0`.
- `one_off` falls through to line 61 → returns `False`. One-off bills are never active in any period.

**Fixture strategy**: Use `types.SimpleNamespace` (or `unittest.mock.MagicMock`) with `frequency`, `start_period`, and `created_at` fields. No DB needed.

**Critical edge cases to test:**
- `monthly` → always `True`
- `quarterly`, anchor `"2026-01"`, target `"2026-01"` → `True` (0-month offset, active at anchor)
- `quarterly`, anchor `"2026-01"`, target `"2026-04"` → `True` (3-month offset)
- `quarterly`, anchor `"2026-01"`, target `"2026-02"` → `False` (1-month offset)
- `quarterly`, anchor `"2026-01"`, target `"2025-12"` → `False` (negative offset)
- `every_2_months`, anchor `"2026-01"`, target `"2026-03"` → `True` (2-month offset)
- `every_2_months`, anchor `"2026-01"`, target `"2026-02"` → `False` (1-month offset)
- `annual`, anchor `"2026-06"`, target `"2027-06"` → `True` (12-month offset)
- `annual`, anchor `"2026-06"`, target `"2027-05"` → `False` (11-month offset)
- `one_off` → `False` for any period
- `start_period=None` with `created_at` fallback → anchor derived from `created_at.strftime("%Y-%m")`

#### `generate_next_instance(db, template, paid_period)` — requires DB session

`backend/app/services/recurrence.py:101–132`

Guards (in order):
1. Line 105–106: If `template.frequency == BillFrequency.one_off` → return `None` immediately. No DB touched.
2. Line 111–120: Idempotency pre-check — query for existing `(bill_id, next_period)`. If found → return existing instance. No new INSERT.
3. Line 122–131: Create new `PaymentInstance`, `db.add()`, `db.commit()`, `db.refresh()`, return.

**Does NOT check `is_paused` or `is_archived`.** The caller (bills router `mark_paid` endpoint) is responsible for those guards. Testing `generate_next_instance` with a paused template will create a next-period instance — this is expected service behavior (the router layer enforces business rules, not the service function).

**Idempotency mechanism**: application-level pre-check (not relying on DB constraint violation). Calling the function twice with the same `(template, paid_period)` returns the existing instance on the second call — it does NOT raise, does NOT create a duplicate.

**DB interaction**: commits immediately after creation and refreshes the instance from DB.

**Test scenarios (SQLite fixture):**
- Monthly template + `paid_period="2026-05"` → creates instance with `period="2026-06"`, `status=upcoming`, correct `due_date`
- `one_off` template → returns `None`; verify no PaymentInstance created
- Idempotency: call twice with same template + period → second call returns same instance (same `.id`); DB has exactly 1 row for `(bill_id, "2026-06")`
- `amount` is copied from template: `instance.amount == template.amount`
- `status` is always `PaymentStatus.upcoming` on creation

#### `ensure_current_period_instances(db, period, user_id)` — requires DB session

`backend/app/services/recurrence.py:64–98`

Filters templates at line 66–75:
- `BillTemplate.user_id == user_id`
- `BillTemplate.is_archived.is_(False)` — archived templates skipped
- `BillTemplate.is_paused.is_(False)` — paused templates skipped
- `BillTemplate.frequency != BillFrequency.one_off` — one_off templates skipped

Then per template:
- Line 76–78: `_bill_active_in_period()` — skips if not active in the period
- Line 79–88: Idempotency pre-check — skips if any `PaymentInstance` with `(bill_id, period)` exists (including soft-deleted rows — `is_deleted` is NOT filtered here; soft-deleted rows act as tombstones per lessons.md)
- Line 89–95: Creates instance if none exists
- Line 97–98: Conditional commit — only commits if `db.new` is non-empty

**Soft-delete tombstone behavior**: a soft-deleted instance (`is_deleted=True`) for a period still satisfies the idempotency check. `ensure_current_period_instances` will NOT re-create the instance. This is the correct behavior (lessons.md §4).

**Test scenarios (SQLite fixture):**
- Active monthly template → instance created for given period
- Archived template → no instance created
- Paused template → no instance created
- One-off template → no instance created
- Quarterly template in wrong-offset period → no instance created (inactive)
- Instance already exists for period → idempotent, no duplicate created
- Soft-deleted instance exists → no new instance created (tombstone respected)
- Multi-user: only creates instances for `user_id` argument's templates

### BillTemplate and PaymentInstance: Fields Required for Test Fixtures

`backend/app/models/bill.py`

**Minimum fields to construct a testable BillTemplate (DB fixture):**
- `name` (String, required)
- `frequency` (BillFrequency enum, required)
- `amount` (Decimal, required)
- `currency` (String, default `"PLN"`)
- `user_id` (int FK, required — must reference a real User row)
- `start_period` (String, optional — set explicitly in tests to avoid `created_at` fallback ambiguity)
- `due_day` (int, optional — set to test clamping)
- `is_paused` (bool, default False)
- `is_archived` (bool, default False)

**Minimum fields to construct a testable PaymentInstance (DB fixture):**
- `bill_id` (int FK, required)
- `period` (String YYYY-MM, required)
- `due_date` (date, required)
- `amount` (Decimal, required)
- `status` (PaymentStatus, default `upcoming`)

**Unique constraint**: `UniqueConstraint("bill_id", "period", name="uq_payment_instance_bill_period")` at `bill.py:77–79`.

**`is_deleted`**: defaults to `False`, server_default `"false"`. For tombstone tests, set `is_deleted=True`.

### Existing Test Infrastructure

`backend/tests/conftest.py` — HTTP client-based fixture (TestClient + DB override)
`backend/tests/test_reminder_job.py` — Service-layer unit tests with SQLite

**Relevant patterns for recurrence tests:**

1. **SQLite in-memory engine** (conftest.py is HTTP-client-focused; test_reminder_job.py sets up its own engine). For service-level recurrence tests, follow `test_reminder_job.py`'s self-contained setup:
   - Define a module-level `_ENGINE` and `_SessionLocal` with `StaticPool`.
   - Use `@pytest.fixture(autouse=True)` `fresh_db` that calls `create_all` / `drop_all`.

2. **`_make_bill(db, user_id)` helper pattern** (`test_reminder_job.py:59–69`):
   - Sets minimum fields, calls `db.add()` + `db.flush()`.
   - Returns the object before commit (so the test controls commit timing).

3. **Assertion pattern** (`test_reminder_job.py:108–130`):
   - Store `.id` before commit.
   - `db.commit()` + `db.close()`.
   - Open fresh session.
   - `db.get(PaymentInstance, inst_id)`.
   - Assert on returned object's attributes.

4. **User requirement**: `test_reminder_job.py` shows that BillTemplate requires a real `User` row (FK). Either import and create a minimal `User`, or use `conftest.py`'s `register_and_login` helper — but for service-level tests that bypass HTTP, creating a `User` directly via `db.add()` is cleaner.

**For pure-function tests** (`_next_period`, `_due_date_for_period`): no DB, no fixtures needed. `@pytest.mark.parametrize` with `(input, expected)` tuples is the right pattern. Import private functions directly with `from app.services.recurrence import _next_period, _due_date_for_period, _bill_active_in_period`.

---

## Code References

- `backend/app/services/recurrence.py:9–28` — `_next_period`: period string arithmetic, all frequency branches, year-rollover via while-loop
- `backend/app/services/recurrence.py:31–36` — `_due_date_for_period`: month clamping via `calendar.monthrange`, leap-year handling, None-due_day default
- `backend/app/services/recurrence.py:39–61` — `_bill_active_in_period`: anchor resolution, months_diff, frequency divisibility, one_off fallthrough returns False
- `backend/app/services/recurrence.py:64–98` — `ensure_current_period_instances`: template query filters (archived/paused/one_off), active-period check, idempotency pre-check, soft-delete tombstone, conditional commit
- `backend/app/services/recurrence.py:101–132` — `generate_next_instance`: one_off early-return, next-period calculation, idempotency pre-check, immediate commit + refresh
- `backend/app/models/bill.py:27–32` — `BillFrequency` enum (monthly, every_2_months, quarterly, annual, one_off)
- `backend/app/models/bill.py:35–38` — `PaymentStatus` enum (upcoming, overdue, paid)
- `backend/app/models/bill.py:41–70` — `BillTemplate` all fields: name, frequency, amount, currency, due_day, is_archived, is_paused, start_period, user_id, created_at
- `backend/app/models/bill.py:73–116` — `PaymentInstance` all fields: bill_id, period, due_date, amount, status, is_deleted (soft-delete tombstone)
- `backend/app/models/bill.py:77–79` — `UniqueConstraint("bill_id", "period", name="uq_payment_instance_bill_period")`
- `backend/tests/conftest.py:20–43` — SQLite StaticPool setup + HTTP TestClient fixture
- `backend/tests/test_reminder_job.py:27–31` — `fresh_db` autouse fixture (create_all/drop_all per test)
- `backend/tests/test_reminder_job.py:59–69` — `_make_bill` helper: minimum fields, db.add() + db.flush() pattern
- `backend/tests/test_reminder_job.py:72–83` — `_make_instance` helper: minimum PaymentInstance fields + **kwargs
- `backend/tests/test_reminder_job.py:108–130` — Full assert pattern: store id → commit/close → reopen → db.get → assert attributes

---

## Architecture Insights

### Layered responsibility: service vs. router

`generate_next_instance` enforces only two invariants: one_off guard and idempotency. It does NOT enforce business rules about paused or archived templates — those are the router's responsibility (`bills.py` calls `generate_next_instance` only after validating ownership and implicitly after confirming the payment action succeeds). Tests for the service should test the service's contract, not the router's.

### Two idempotency mechanisms side by side

Both `generate_next_instance` and `ensure_current_period_instances` use an application-level pre-check (`db.query().first()`) before INSERT — they never rely on catching a `UniqueConstraint` violation from the DB. The DB constraint (`uq_payment_instance_bill_period`) is a safety backstop, not the primary mechanism. This means tests can verify idempotency by asserting the row count in the DB, not by asserting absence of exceptions.

### Soft-delete tombstone is transparent to `ensure_current_period_instances`

The idempotency query at lines 82–87 does NOT filter on `is_deleted`. A soft-deleted row for a `(bill_id, period)` pair is a tombstone — the seeder treats it as "already exists" and skips creation. This is an invariant from lessons.md (§4) and must be covered by at least one test case.

### Pure vs. DB-bound split

The three private helper functions are 100% pure: they use only their arguments, `calendar.monthrange` from stdlib, and `datetime.date`. They can be tested in total isolation with `@pytest.mark.parametrize`. The two public functions require sessions but no HTTP layer — SQLite in-memory is sufficient for Phase 1. The SQLite→PostgreSQL migration risk (Risk #4 in the test plan) is out of scope for Phase 1.

### `_bill_active_in_period` and `start_period` fallback

The `created_at` fallback (line 46) exists for backward compatibility with rows predating the `start_period` column. In tests, always set `start_period` explicitly to avoid ambiguity — tests that rely on the `created_at` fallback are testing a backward-compat path that should be covered separately.

---

## Historical Context

- `context/archive/2026-06-12-core-payment-tracking-loop/plan.md` — Original implementation of `ensure_current_period_instances` and `generate_next_instance`; notes that `(bill_id, period)` unique constraint is the idempotency backstop and that the function fires on every GET safely.
- `context/archive/2026-06-15-per-user-data-scoping/plan.md` — Added `user_id` parameter to `ensure_current_period_instances`; notes that `generate_next_instance` receives the template object directly and therefore needs no signature change for user scoping.
- `context/archive/2026-06-15-revert-payment/plan.md` — Documented that the next-period instance created by mark-paid is **preserved** on revert (by design, to avoid cascading data loss). Tests for `generate_next_instance` should not assume the next-period instance is removed if the payment is later reverted.
- `context/archive/2026-06-16-email-reminders/plan.md` — Added reminder flags to `PaymentInstance` (reminder_sent_upcoming, etc.). These are written by the reminder job, not by recurrence functions — safe to ignore in recurrence tests.
- `context/foundation/lessons.md:29–35` — Soft-delete tombstone rule: `is_deleted=True` row satisfies idempotency check; seeder never regenerates. This is a test invariant to cover.

---

## Open Questions

None — all risk response guidance from the test plan has been verified and grounded. Corrections to the test plan `§2`:

1. **No anchor corrections needed.** The test plan cited `backend/app/services` hot-spot (16 commits/30d) as likelihood evidence for Risks #1 and #2 — this is valid; `recurrence.py` lives in that directory.
2. **Response guidance for Risk #1 correction**: the test plan said "challenge assumption that `mark-paid returns 200` implies next-period instance was created." This is slightly off as a testing concern for the *service* layer — the service's contract is narrower than the HTTP response. For Phase 1 service tests, reframe as: "challenge assumption that `generate_next_instance` returning a non-None value means the instance was persisted — always re-query from DB to confirm." The HTTP-layer concern remains valid for Phase 4 E2E tests.
3. **New finding — `generate_next_instance` does not check `is_paused`**: the test plan's Risk Response Guidance for Risk #1 should note that paused-template behavior is tested via `ensure_current_period_instances` (which does filter `is_paused`), not via `generate_next_instance`. The test file should document this as an explicit invariant comment.

---

## Recommended Test File Structure

**File**: `backend/tests/test_recurrence_service.py`

**Section 1 — Pure parametrized tests (no DB, no imports of app.models):**
- `test_next_period_monthly_year_rollover` — parametrize all monthly boundary cases
- `test_next_period_multi_month_frequencies` — every_2_months and quarterly rollover
- `test_next_period_annual` — year increment
- `test_due_date_for_period_clamping` — parametrize all clamping cases incl. leap year
- `test_bill_active_in_period_monthly_always_true`
- `test_bill_active_in_period_parametrized` — all frequency / offset / anchor combinations

**Section 2 — DB-backed service tests (SQLite, fresh_db autouse):**
- `test_generate_next_instance_creates_monthly_next_period`
- `test_generate_next_instance_one_off_returns_none`
- `test_generate_next_instance_idempotent`
- `test_generate_next_instance_amount_and_due_date_correct`
- `test_ensure_current_period_skips_archived`
- `test_ensure_current_period_skips_paused`
- `test_ensure_current_period_skips_one_off`
- `test_ensure_current_period_skips_inactive_period` (quarterly in wrong month)
- `test_ensure_current_period_idempotent`
- `test_ensure_current_period_respects_soft_delete_tombstone`

**Total**: approximately 20–25 test functions. All self-contained; no shared mutable state.
