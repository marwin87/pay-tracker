# Recurrence Unit Tests — Plan Brief

> Full plan: `context/changes/testing-recurrence-unit/plan.md`
> Research: `context/changes/testing-recurrence-unit/research.md`

## What & Why

Write `backend/tests/test_recurrence_service.py` to close the most consequential untested surface in the backend: the five functions in `recurrence.py` that drive the core bill-tracking loop. Without these tests, month-boundary math errors and silent next-instance creation failures are only caught by manual testing or user reports. This is Phase 1 of the test plan rollout (`context/foundation/test-plan.md`), covering Risks #1 and #2.

## Starting Point

`backend/app/services/recurrence.py` has five functions and zero dedicated tests. Four existing test files (`test_user_scoping.py`, `test_reminder_job.py`, `test_restore.py`, `test_email_service.py`) test the HTTP and service layers but none touch recurrence directly. The `test_reminder_job.py` SQLite StaticPool pattern is the model to follow for DB-backed tests.

## Desired End State

`backend/tests/test_recurrence_service.py` exists with ~25 passing test functions. `uv run pytest tests/test_recurrence_service.py -v` exits 0. The file is organized in two sections — pure parametrized tests first (no DB), then SQLite-backed service tests — each runnable independently.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Phase split | Two sub-phases (pure first, then DB) | Pure tests deliver immediate feedback before any fixture setup is needed | Plan |
| `_bill_active_in_period` fixture | `types.SimpleNamespace` | Only reads `.frequency`, `.start_period`, `.created_at` — no SQLAlchemy session needed | Research |
| Backward-compat path | Include in Phase 1 | `start_period=NULL` rows exist in production; the fallback is a real code path | Plan |
| `_next_period` one_off | Document as invariant test | Makes the guard-in-generate_next_instance coupling explicit; prevents accidental "fix" | Plan |
| SQLite DB pattern | Follow `test_reminder_job.py` exactly | Established pattern in the codebase; avoids polluting `conftest.py` | Research |
| PostgreSQL migration | Deferred to Phase 2 rollout | Structural fix (Risk #4) is out of scope for the unit-test phase | Research |
| `generate_next_instance` + paused | Not tested here | paused/archived guards live in `ensure_current_period_instances`, not this function | Research |

## Scope

**In scope:**
- `_next_period` — all frequencies, year-rollover edge cases, one_off invariant
- `_due_date_for_period` — month clamping, leap year, None due_day
- `_bill_active_in_period` — all frequencies, anchor math, negative offset, one_off, created_at fallback
- `generate_next_instance` — monthly happy path, one_off guard, idempotency, field correctness
- `ensure_current_period_instances` — archived/paused/one_off/inactive-period skips, idempotency, soft-delete tombstone, user scoping

**Out of scope:**
- Bills router and HTTP layer (Phase 4 E2E)
- SQLite → PostgreSQL fixture migration (Phase 2 rollout)
- Modifying `conftest.py`
- New `pyproject.toml` dependencies
- Reminder flag fields on `PaymentInstance`

## Architecture / Approach

One new file, two self-contained sections. Section 1 imports three private functions directly (`from app.services.recurrence import _next_period, _due_date_for_period, _bill_active_in_period`) and tests them with `@pytest.mark.parametrize` — expected values are hardcoded `date()` literals, never recomputed via the formula under test. Section 2 adds a module-level SQLite `StaticPool` engine, `fresh_db` autouse fixture, and `_make_user`/`_make_bill`/`_make_instance` helpers, then tests the two public functions against a real DB session.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Pure function unit tests | ~21 parametrized tests for `_next_period`, `_due_date_for_period`, `_bill_active_in_period` | Test expected values accidentally mirror production formula (oracle problem) |
| 2. DB-backed service tests | ~12 SQLite tests for `generate_next_instance` and `ensure_current_period_instances` | fresh_db fixture interaction with StaticPool singleton — must use `autouse=True` correctly |

**Prerequisites:** None — `pytest ≥ 8.0` and `httpx ≥ 0.28` already in `pyproject.toml`; no new deps required.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- SQLite in-memory does not enforce all PostgreSQL constraints (e.g., ON DELETE CASCADE behavior may differ). This is acknowledged and accepted for Phase 1; Phase 2 of the test plan rollout (`testing-postgresql-baseline`) will address it.
- `_next_period` with `one_off` silently returns the same period (no error). This is an internal invariant that depends on `generate_next_instance`'s guard remaining in place. The invariant test documents this coupling explicitly.

## Success Criteria (Summary)

- `cd backend && uv run pytest tests/test_recurrence_service.py -v` — ~25 passed, 0 failed, 0 skipped
- `cd backend && uv run pytest tests/ -v` — full suite still green (no regressions)
- `test_ensure_respects_soft_delete_tombstone` and `test_generate_next_instance_idempotent` both explicitly green in the output
