# PostgreSQL Integration Baseline — Implementation Plan

## Overview

Replace the SQLite StaticPool test infrastructure with real PostgreSQL via testcontainers, consolidate three scattered test engines into one shared fixture, and add the one missing IDOR test (`delete_payment`). The goal is that all 80 tests pass against real PostgreSQL, giving CI a meaningful gate for constraint, type-coercion, and date-arithmetic correctness (Risk #4) and full IDOR coverage on per-instance mutations (Risk #3).

## Current State Analysis

42 tests across 6 files. Three module-level SQLite engines with StaticPool, each with its own autouse schema-management fixture:

- `backend/tests/conftest.py:20-24` — powers `client` (HTTP tests)
- `backend/tests/test_recurrence_service.py:148-153` — `_DB_ENGINE` / `_DBSession` / `fresh_db_s2` autouse
- `backend/tests/test_reminder_job.py:19-24` — `_ENGINE` / `_SessionLocal` / `fresh_db` autouse

`psycopg2-binary` is in production deps but not dev deps. No `testcontainers` anywhere. CI (`ci.yml:61`) runs `uv run pytest tests/ -v` with no PostgreSQL service — SQLite only.

IDOR ownership checks exist in code for all three per-instance mutations (`pay`, `unpay`, `delete`) but `DELETE /bills/payments/{instance_id}` has no cross-user 403 test. The four existing IDOR tests (`test_user_scoping.py:71-128`) all run against SQLite.

`test_reminder_job.py` has a non-trivial session contract: `send_daily_reminders` accepts a **sessionmaker class** (not an instance) and creates sessions internally. This requires a separate `db_sessionmaker` fixture alongside `db_session`.

`test_email_service.py` has no DB engine — pure mocked tests, no migration needed.

## Desired End State

`uv run pytest tests/ -v` in `backend/` runs all 80 tests against a real PostgreSQL 17 container spun up by testcontainers. No SQLite. No StaticPool. One session-scoped container, clean tables per test via `drop_all`/`create_all`. The `delete_payment` endpoint has a cross-user 403 test. CI (`backend-tests` job) exercises real PostgreSQL automatically since testcontainers spins its own Docker container (ubuntu-latest has Docker).

### Key Discoveries

- `backend/tests/conftest.py:57` — `register_and_login` and `auth` helpers are imported by `test_user_scoping.py` — keep them unchanged
- `backend/alembic/env.py:59` — Alembic already uses `NullPool`; same pool for test engine
- `backend/tests/test_recurrence_service.py:221-457` — 12 DB-backed tests each open 2-3 SQLite sessions; collapse to one `db_session` parameter per test
- `backend/tests/test_reminder_job.py:102,120,146` — `send_daily_reminders(_SessionLocal, ...)` takes a sessionmaker class; replace with `db_sessionmaker` fixture
- `test_reminder_job.py` verification queries (`db = _SessionLocal(); refreshed = db.get(...)`) must use `db_session.expire_all()` after the service commits via its own session

## What We're NOT Doing

- Changing any test assertion logic, test names, or test structure beyond the DB-session wiring
- Migrating `test_email_service.py` (no DB engine — left as-is)
- Switching from `Base.metadata.create_all()` to Alembic migrations in tests
- Parallelizing tests with pytest-xdist (NullPool removes the StaticPool blocker but xdist is not in scope)
- Refactoring the per-instance ownership check pattern in the router (Phase 2 tests correctness, not style)
- Adding a PostgreSQL service block to `ci.yml` (testcontainers makes this unnecessary)

## Implementation Approach

Single session-scoped testcontainers PostgreSQL container, shared across all 43 tests. Schema is dropped and recreated per test via function-scoped `db_tables` fixture. Two companion fixtures (`db_session` and `db_sessionmaker`) depend on `db_tables` for schema lifecycle. The `client` fixture manages its own schema independently (HTTP tests don't use `db_session`). Files migrate one at a time; each phase is independently verifiable.

## Critical Implementation Details

**Two-session → one-session collapse:** The current recurrence tests open a new `_DBSession()` after `db.commit(); db.close()` to get a "clean" view of committed data. With `db_session`, a single session throughout the test is sufficient: SQLAlchemy expires all objects on `commit()` (default `expire_on_commit=True`), so a subsequent `db_session.get(BillTemplate, bill_id)` re-fetches from DB. The multi-session pattern is a StaticPool artifact — drop it.

**Reminder test verification:** `send_daily_reminders(db_sessionmaker)` commits flag changes via an internal session that `db_session` doesn't share. After the service call, `db_session.expire_all()` forces re-read from DB on the next access — this is the only way to see the committed changes in the same `db_session` object.

**pytest fixture deduplication:** When a test requests both `db_session` and `db_sessionmaker`, both depend on `db_tables`. pytest deduplicates function-scoped fixtures per test, so `create_all` runs once and `drop_all` runs once. `db_session.close()` happens before `db_tables` teardown (reverse dependency order) — the schema drop occurs after the session is closed, which is correct.

---

## Phase 1: PostgreSQL Fixture Foundation

### Overview

Add `testcontainers[postgresql]` to dev deps, update the lockfile, and rewrite `conftest.py` with a session-scoped PostgreSQL engine and three new function-scoped fixtures. After this phase, all HTTP tests (`test_user_scoping.py`, `test_restore.py`) and email tests pass.

### Changes Required

#### 1. Add dev dependencies

**File**: `backend/pyproject.toml`

**Intent**: Add `testcontainers[postgresql]` (PostgreSQL container management) and `psycopg2-binary` (make the driver explicit in dev deps, mirroring its presence in prod deps) to the `[dependency-groups] dev` section.

**Contract**: Both packages added under `dev = [...]`. `testcontainers[postgresql]>=4.0` for the `PostgresContainer` class and its `get_connection_url()` method.

#### 2. Update lockfile

**File**: `backend/uv.lock`

**Intent**: Regenerate after the pyproject.toml edit so CI picks up the new packages.

**Contract**: Run `uv lock` inside `backend/`.

#### 3. Rewrite conftest.py

**File**: `backend/tests/conftest.py`

**Intent**: Replace the SQLite engine + StaticPool with a session-scoped testcontainers PostgreSQL engine. Add `db_tables` (schema lifecycle), `db_session` (a session for service/job tests), and `db_sessionmaker` (a sessionmaker class for services that create their own sessions) as function-scoped fixtures. Update `client` to use the shared engine instead of the hardcoded SQLite URL. Remove `StaticPool` import.

**Contract**:

```python
# Imports needed (in addition to existing):
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def postgres_engine():
    with PostgresContainer("postgres:17") as pg:
        engine = create_engine(pg.get_connection_url(), poolclass=NullPool)
        yield engine

@pytest.fixture()
def db_tables(postgres_engine):
    Base.metadata.create_all(bind=postgres_engine)
    yield
    Base.metadata.drop_all(bind=postgres_engine)

@pytest.fixture()
def db_session(postgres_engine, db_tables):
    # yields a session; db_tables owns create_all/drop_all
    Session = sessionmaker(bind=postgres_engine, autocommit=False, autoflush=False)
    db = Session()
    yield db
    db.close()

@pytest.fixture()
def db_sessionmaker(postgres_engine, db_tables):
    # returns a sessionmaker class; used by services that create their own sessions
    return sessionmaker(bind=postgres_engine, autocommit=False, autoflush=False)

@pytest.fixture()
def client(postgres_engine):
    Base.metadata.create_all(bind=postgres_engine)
    _SessionLocal = sessionmaker(bind=postgres_engine, autocommit=False, autoflush=False)
    def _override_get_db():
        db = _SessionLocal()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=postgres_engine)
```

`register_and_login` and `auth` helpers remain unchanged.

### Success Criteria

#### Automated Verification

- `uv lock` completes without error
- `uv run pytest tests/test_user_scoping.py tests/test_restore.py tests/test_email_service.py -v` — all 14 tests pass (8 + 6 + 4 — email tests pass because they have no engine dependency)

#### Manual Verification

- Confirm no SQLite import or StaticPool anywhere in conftest.py after the rewrite

---

## Phase 2: Migrate test_recurrence_service.py

### Overview

Remove the local `_DB_ENGINE` / `_DBSession` / `fresh_db_s2` autouse fixture from `test_recurrence_service.py`. Refactor the 12 DB-backed tests (Section 2, lines 221–457) to accept `db_session` as a fixture parameter. Section 1 (pure-function tests, lines 1–145) is untouched.

### Changes Required

#### 1. Remove local engine infrastructure

**File**: `backend/tests/test_recurrence_service.py`

**Intent**: Remove `_DB_ENGINE`, `_DBSession`, the `fresh_db_s2` autouse fixture, and the `StaticPool` import — all of which were providing SQLite isolation that is now handled by `db_session` from conftest.

**Contract**: Delete lines 148–160 (engine, sessionmaker, autouse fixture). Remove `from sqlalchemy.pool import StaticPool` from imports. The `create_engine`, `sessionmaker` imports can also be removed if no longer used elsewhere in the file.

#### 2. Refactor the 12 DB-backed test functions

**File**: `backend/tests/test_recurrence_service.py` — Section 2 (lines 221–457)

**Intent**: Each test that currently opens one or more `_DBSession()` sessions should instead accept `db_session` as a parameter. The multi-session patterns (setup session → close → action session → close) collapse to a single session: after `db_session.commit()`, SQLAlchemy auto-expires all objects, so a `db_session.get(Model, id)` re-fetches from DB without needing a new session.

**Contract**: For every test function in Section 2:
- Add `db_session` as the first parameter (type hint `Session` is optional but harmless)
- Replace all `db = _DBSession()` lines with uses of `db_session`
- Remove all `db.close()` calls (fixture handles close in teardown)
- Replace `db.commit()` with `db_session.commit()`, `db.add()` with `db_session.add()`, etc.
- Where a test opened a second session after `db.close()` to re-fetch an object (e.g., `db = _DBSession(); bill = db.get(BillTemplate, bill_id)`), instead call `db_session.get(BillTemplate, bill_id)` on the already-expired object — the commit auto-expiry handles the refresh
- The `_make_user`, `_make_bill`, `_make_instance` helpers already accept `db` as first arg; pass `db_session`

Affected test functions (line numbers are approximate post-Phase-1 edit):
`test_generate_next_instance_monthly_creates_next_period`,
`test_generate_next_instance_one_off_returns_none`,
`test_generate_next_instance_idempotent`,
`test_generate_next_instance_copies_amount_and_due_date`,
`test_ensure_creates_instance_for_active_template`,
`test_ensure_skips_archived_template`,
`test_ensure_skips_paused_template`,
`test_ensure_skips_one_off_template`,
`test_ensure_skips_inactive_period`,
`test_ensure_idempotent`,
`test_ensure_respects_soft_delete_tombstone`,
`test_ensure_scoped_to_user`

### Success Criteria

#### Automated Verification

- `uv run pytest tests/test_recurrence_service.py -v` — all 16 tests pass (4 pure-function + 12 DB-backed)
- No `StaticPool`, `_DB_ENGINE`, or `_DBSession` symbol remaining in `test_recurrence_service.py`

#### Manual Verification

- `grep -n "StaticPool\|_DBSession\|_DB_ENGINE\|fresh_db_s2" backend/tests/test_recurrence_service.py` returns empty

---

## Phase 3: Migrate test_reminder_job.py

### Overview

Remove the local `_ENGINE` / `_SessionLocal` / `fresh_db` autouse fixture from `test_reminder_job.py`. Refactor all 8 test functions to use `db_session` for DB setup and `db_sessionmaker` when passing a session factory to `send_daily_reminders`. Add `db_session.expire_all()` before verification queries that check state committed by the service's internal session.

### Changes Required

#### 1. Remove local engine infrastructure

**File**: `backend/tests/test_reminder_job.py`

**Intent**: Remove `_ENGINE`, `_SessionLocal`, the `fresh_db` autouse fixture, and the `StaticPool` import. Schema lifecycle and session management move to conftest fixtures.

**Contract**: Delete lines 19–31 (engine, sessionmaker, autouse fixture). Remove `from sqlalchemy.pool import StaticPool` from imports. Remove `create_engine` and `sessionmaker` imports if unused after the edit.

#### 2. Refactor all 8 test functions

**File**: `backend/tests/test_reminder_job.py`

**Intent**: Tests that seed DB data and then call `send_daily_reminders` need two fixtures: `db_session` for seeding and `db_sessionmaker` to pass as the session factory argument to the service. After the service call, `db_session.expire_all()` forces re-read from DB so that changes committed by the service's internal session are visible.

**Contract**: For every test function:
- Add `db_session` and/or `db_sessionmaker` as parameters (use only what the test needs)
- Replace `db = _SessionLocal()` setup lines with `db_session`
- Remove `db.close()` calls (fixture handles close)
- Replace `_SessionLocal` argument to `send_daily_reminders(...)` with `db_sessionmaker`
- Where a test opens a new `db = _SessionLocal()` for post-service verification (e.g., `refreshed = db.get(PaymentInstance, inst_id)`), instead call `db_session.expire_all()` first, then use `db_session.get(PaymentInstance, inst_id)` directly
- `test_no_smtp_skips_all` only needs `db_sessionmaker` (no DB seeding); schema is still created because `db_sessionmaker` depends on `db_tables`

Affected functions: all 8 test functions in the file. Pattern is uniform — seed → commit → service call with `db_sessionmaker` → `expire_all()` → verify via `db_session`.

### Success Criteria

#### Automated Verification

- `uv run pytest tests/test_reminder_job.py -v` — all 8 tests pass
- No `StaticPool`, `_ENGINE`, `_SessionLocal`, or `fresh_db` remaining in `test_reminder_job.py`

#### Manual Verification

- `grep -n "StaticPool\|_ENGINE\|_SessionLocal\|fresh_db" backend/tests/test_reminder_job.py` returns empty

---

## Phase 4: IDOR Delete Test + Full Suite Green

### Overview

Add the one missing cross-user test (`delete_payment`), then run the complete suite to confirm all 43 tests pass on real PostgreSQL.

### Changes Required

#### 1. Add test_delete_payment_other_user_returns_403

**File**: `backend/tests/test_user_scoping.py`

**Intent**: `DELETE /bills/payments/{instance_id}` has the same raw-load + ownership check pattern as the other three mutation endpoints (`pay`, `unpay`, update_bill), but has no cross-user test. Add one that mirrors the exact structure of `test_mark_paid_other_user_returns_403`.

**Contract**: New test function appended to the "Mutation endpoints" section (after `test_archive_bill_other_user_returns_403`, before the Export section). Shape:
1. Register users A and B
2. A creates a bill; seed A's payment instance via `_seed_payment`
3. B calls `client.delete(f"/bills/payments/{instance_id}", headers=auth(tok_b))`
4. Assert `r.status_code == 403`

No need to assert the instance still exists — agreed to match the existing IDOR test pattern (status code only).

### Success Criteria

#### Automated Verification

- `uv run pytest tests/ -v` — all 80 tests pass (79 existing + 1 new; 80 reflects parametrized expansion)
- `uv run pytest tests/test_user_scoping.py -v` — 9 tests pass

#### Manual Verification

- Confirm `test_delete_payment_other_user_returns_403` appears in the test output by name
- Confirm the test run shows "PostgreSQL" container startup in output (not SQLite)

---

## Testing Strategy

### Unit Tests

- Pure-function tests in `test_recurrence_service.py` Section 1 remain unchanged and continue to run without a DB
- DB-backed service tests verify the same logical scenarios as before — same assertions, different session wiring

### Integration Tests

- All HTTP tests (`test_user_scoping.py`, `test_restore.py`) exercise real PostgreSQL constraints: unique-key conflicts on `(bill_id, period)`, FK cascade behavior on template archive, RETURNING semantics
- Cross-user 403 tests now verified against PostgreSQL's actual query execution, not SQLite's approximation

### Manual Testing Steps

1. Locally: `cd backend && uv run pytest tests/ -v` — observe testcontainers pull `postgres:17` on first run (~30s), then tests run in ~5-10s on warm cache
2. Observe no SQLite-specific output in pytest logs
3. Push to a branch and verify the `backend-tests` CI job passes (Docker is available on `ubuntu-latest`)

## Migration Notes

No data migration required — this is a test infrastructure change only. Production database is unaffected. The `uv.lock` update must be committed alongside `pyproject.toml` so CI picks up the new packages.

## References

- Research: `context/changes/testing-postgresql-integration/research.md`
- Test plan (risks #3, #4): `context/foundation/test-plan.md`
- Per-user scoping implementation (ownership check pattern): `context/archive/2026-06-15-per-user-data-scoping/plan.md:264-286`
- Alembic NullPool precedent: `backend/alembic/env.py:59`
- Existing IDOR tests to mirror: `backend/tests/test_user_scoping.py:71-83`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: PostgreSQL Fixture Foundation

#### Automated

- [x] 1.1 `uv lock` completes without error
- [x] 1.2 `uv run pytest tests/test_user_scoping.py tests/test_restore.py tests/test_email_service.py -v` — 14 tests pass

#### Manual

- [x] 1.3 Confirm no SQLite import or StaticPool remaining in conftest.py

### Phase 2: Migrate test_recurrence_service.py

#### Automated

- [x] 2.1 `uv run pytest tests/test_recurrence_service.py -v` — all 16 tests pass
- [x] 2.2 `grep -n "StaticPool\|_DBSession\|_DB_ENGINE\|fresh_db_s2" backend/tests/test_recurrence_service.py` returns empty

#### Manual

- [x] 2.3 Confirm Section 1 pure-function tests are untouched (no `db_session` parameter added to them)

### Phase 3: Migrate test_reminder_job.py

#### Automated

- [x] 3.1 `uv run pytest tests/test_reminder_job.py -v` — all 8 tests pass
- [x] 3.2 `grep -n "StaticPool\|_ENGINE\|_SessionLocal\|fresh_db" backend/tests/test_reminder_job.py` returns empty

#### Manual

- [x] 3.3 Confirm `test_no_smtp_skips_all` uses only `db_sessionmaker` (no `db_session` parameter)

### Phase 4: IDOR Delete Test + Full Suite Green

#### Automated

- [x] 4.1 `uv run pytest tests/ -v` — all 43 tests pass
- [x] 4.2 `uv run pytest tests/test_user_scoping.py -v` — 9 tests pass

#### Manual

- [x] 4.3 `test_delete_payment_other_user_returns_403` appears by name in the test output
- [x] 4.4 Testcontainers PostgreSQL startup message visible in test output (confirms real PostgreSQL, not SQLite)
