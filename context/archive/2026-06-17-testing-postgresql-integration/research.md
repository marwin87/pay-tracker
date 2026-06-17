---
date: 2026-06-17T00:00:00+00:00
researcher: mariusz
git_commit: f026f94cf9822015b88969aea80a11e596a0e25c
branch: main
repository: pay-tracker
topic: "PostgreSQL integration baseline — replace SQLite fixture and add IDOR integration tests"
tags: [research, testing, postgresql, idor, sqlite-migration, integration-tests]
status: complete
last_updated: 2026-06-17
last_updated_by: mariusz
---

# Research: PostgreSQL Integration Baseline

**Date**: 2026-06-17  
**Researcher**: mariusz  
**Git Commit**: f026f94cf9822015b88969aea80a11e596a0e25c  
**Branch**: main  
**Repository**: pay-tracker

## Research Question

What does the current test infrastructure look like (SQLite fixture, conftest setup, three-engine problem), and what is the IDOR surface on per-instance router endpoints? What PostgreSQL tooling exists today that the plan can build on?

## Summary

The test suite has 42 tests across 6 files. The SQLite StaticPool pattern is duplicated in **three separate module-level engines** (conftest.py, test_recurrence_service.py, test_reminder_job.py) — all must be migrated. `psycopg2-binary` is already in production deps; no test-PostgreSQL library exists yet. The IDOR ownership checks in the router code are correct and tested for 4 of the 5 mutable per-instance endpoints, but **`DELETE /bills/payments/{instance_id}` has no ownership test**. All 8 existing scoping tests run on SQLite only — they must be verified against real PostgreSQL. CI has no PostgreSQL service.

## Detailed Findings

### A. Test Infrastructure

#### File inventory

| File | Tests | What it covers |
|------|-------|----------------|
| `backend/tests/conftest.py` | — | Shared fixtures + helpers |
| `backend/tests/test_user_scoping.py` | 8 | Cross-user 403 / scoped list endpoints |
| `backend/tests/test_recurrence_service.py` | 16 | Period math + instance generation (pure + DB) |
| `backend/tests/test_email_service.py` | 4 | Email rendering (mocked SMTP) |
| `backend/tests/test_restore.py` | 6 | JSON backup round-trip |
| `backend/tests/test_reminder_job.py` | 8 | Reminder scheduler (mocked SMTP) |

#### The three-engine problem

SQLite StaticPool is instantiated three times at module level:

- `backend/tests/conftest.py:17-24` — powers the `client` fixture used by test_user_scoping.py and test_restore.py
- `backend/tests/test_recurrence_service.py:148-160` — autouse fixture `fresh_db_s2`; service tests call `_DBSession()` directly
- `backend/tests/test_reminder_job.py:19-31` — autouse fixture `fresh_db`; job tests call `_ENGINE` directly

All three use `StaticPool`. A comment at `conftest.py:19` notes it is "incompatible with pytest-xdist (-n auto)". **Migrating to PostgreSQL requires unifying these into a shared conftest fixture.**

#### conftest.py fixture shape

```python
# conftest.py:17-43 (condensed)
_ENGINE = create_engine("sqlite:///:memory:", connect_args={...}, poolclass=StaticPool)
_SessionLocal = sessionmaker(bind=_ENGINE, ...)

def _override_get_db():
    db = _SessionLocal(); yield db; db.close()

@pytest.fixture
def client():
    Base.metadata.create_all(bind=_ENGINE)
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=_ENGINE)
```

Helper functions (module-level, not fixtures):
- `register_and_login(client, email, password)` → Bearer token string (`conftest.py:46-53`)
- `auth(token)` → `{"Authorization": "Bearer <token>"}` dict (`conftest.py:55-56`)

#### Test dependencies (pyproject.toml:23-28)

```toml
[dependency-groups]
dev = [
    "black>=26.5.1",
    "mypy>=2.1.0",
    "pytest>=8.0",
    "httpx>=0.28",
]
```

**Missing for PostgreSQL tests:** no `testcontainers`, `pytest-postgresql`, `pytest-docker`, or `psycopg2-binary` in the dev group. `psycopg2-binary>=2.9.12` is in the production dependency group (`pyproject.toml:12`) — it is available at runtime but should also be explicit in dev deps.

---

### B. IDOR Surface Map

PaymentInstance has **no `user_id` column**. Ownership is inherited via `BillTemplate.user_id` (the parent FK).

| Endpoint | Method | Function | File:Line | Load type | Ownership check | Test exists? |
|----------|--------|----------|-----------|-----------|-----------------|--------------|
| `/bills/payments/{instance_id}/pay` | POST | `mark_paid` | `bills.py:107-152` | `db.get(PaymentInstance, id)` raw | `template.user_id != me.id` → 403 at `bills.py:121` | **Yes** — `test_mark_paid_other_user_returns_403` |
| `/bills/payments/{instance_id}/unpay` | POST | `revert_payment` | `bills.py:155-192` | `db.get(PaymentInstance, id)` raw | `template.user_id != me.id` → 403 at `bills.py:165` | **Yes** — `test_revert_payment_other_user_returns_403` |
| `/bills/payments/{instance_id}` | DELETE | `delete_payment` | `bills.py:195-210` | `db.get(PaymentInstance, id)` raw | `template.user_id != me.id` → 403 at `bills.py:206` | **NO — gap** |

**Ownership-check pattern used by all three:**
```python
instance = db.get(PaymentInstance, instance_id)          # raw, unscoped
if not instance:
    raise HTTPException(404, "Payment instance not found")
template = instance.template                             # lazy-load join
if template.user_id != me.id:
    raise HTTPException(403, "Not authorized")           # check before mutation
```

The check is correct in all three cases. The gap is test coverage: `delete_payment` has no cross-user 403 test. All three existing IDOR tests run on SQLite — they must be re-verified on real PostgreSQL as part of Phase 2.

**Also confirmed safe:** `GET /bills/payments` at `bills.py:55-104` filters at query level (`BillTemplate.user_id == me.id`), never loading cross-user instances.

---

### C. PostgreSQL Tooling

#### Application DB config

- **Engine:** Sync SQLAlchemy (`create_engine`, not `create_async_engine`) — `backend/app/core/database.py`
- **Driver:** `psycopg2-binary` (sync; no asyncpg)
- **Default URL:** `postgresql://paytracker:changeme@localhost:5432/paytracker` (`backend/app/core/config.py`)
- **Alembic:** Already configured with `NullPool` for migrations (`backend/alembic/env.py:59`); runs `alembic upgrade head` on container start

#### Docker architecture

PostgreSQL 17 runs **inside the backend Docker container** (co-located, not a separate service). The Dockerfile installs `postgresql-17` and a supervisor config starts both postgres and uvicorn. There is **no separate `postgres` service in docker-compose.yml** — it is embedded in the backend service.

This matters for test strategy: there is no pre-existing docker-compose postgres service to point tests at. The test fixture must spin up its own PostgreSQL instance.

#### CI (`ci.yml:45-61`)

```yaml
- name: Run backend tests
  run: uv run pytest tests/ -v
```

No PostgreSQL service defined. Tests run against SQLite only. A `docker compose up` job exists but does not run pytest against the live stack. **CI must be updated** to either add a PostgreSQL service or rely on testcontainers (which spins its own Docker container during the test run).

#### What must be added

| Package | Purpose | Where |
|---------|---------|-------|
| `testcontainers[postgresql]` | Spin up real PostgreSQL in pytest | dev deps |
| `psycopg2-binary` | Driver (already in prod deps; add to dev for clarity) | dev deps |

Alternative: `pytest-postgresql` — provides a `postgresql` fixture using an existing pg binary. Testcontainers is preferred because it is self-contained (no local PostgreSQL install required in CI).

---

### D. Historical Context

#### `context/archive/2026-06-15-per-user-data-scoping`

The IDOR protection was implemented in this change. Key decisions recorded in `plan.md:264-286`:
- Unified 403 guard pattern: fetch → check ownership → raise before mutation
- Order in `revert_payment` matters: 404 → 403 → 400 (prevents leaking payment state across users)
- `list_payments` uses `selectinload` not `joinedload` to avoid SQLAlchemy strategy conflicts
- Test helper `register_and_login` was established here; 8 cross-user tests added

The impl-review for this change (`reviews/impl-review.md`) raised `F4 (OBSERVATION)`: "SQLite `StaticPool` singleton incompatible with pytest-xdist" — flagged but deferred. Phase 2 resolves it.

#### `context/archive/2026-06-17-testing-recurrence-unit`

Phase 1 of the test rollout (done). Established the autouse `fresh_db_s2` fixture pattern used in test_recurrence_service.py. That pattern must be migrated to PostgreSQL in Phase 2.

## Code References

- `backend/tests/conftest.py:17-24` — SQLite engine + StaticPool declaration
- `backend/tests/conftest.py:36-43` — `client` fixture (create_all / drop_all lifecycle)
- `backend/tests/conftest.py:46-56` — `register_and_login` + `auth` helpers
- `backend/tests/test_recurrence_service.py:148-160` — second SQLite engine (service tests)
- `backend/tests/test_reminder_job.py:19-31` — third SQLite engine (job tests)
- `backend/tests/test_user_scoping.py:71-83` — existing `mark_paid` IDOR test
- `backend/tests/test_user_scoping.py:86-104` — existing `revert_payment` IDOR test
- `backend/app/routers/bills.py:107-152` — `mark_paid` with raw load + ownership check
- `backend/app/routers/bills.py:155-192` — `revert_payment` with raw load + ownership check
- `backend/app/routers/bills.py:195-210` — `delete_payment` with raw load + ownership check (UNTESTED for IDOR)
- `backend/app/core/database.py` — sync engine, `get_db()` dependency
- `backend/app/core/config.py` — `database_url` default
- `backend/alembic/env.py:59` — Alembic uses NullPool (model for test fixture)
- `backend/pyproject.toml:12` — `psycopg2-binary` in production deps
- `backend/pyproject.toml:23-28` — dev deps (missing testcontainers)
- `.github/workflows/ci.yml:45-61` — pytest step with no PostgreSQL service

## Architecture Insights

1. **Three-engine consolidation is the main structural work.** The plan must provide a single pytest fixture (probably session-scoped engine + function-scoped session rollback, or drop_all/create_all per test) that all three test files can import from conftest.py. Tests that currently call `_DBSession()` directly need to receive the session via a fixture parameter.

2. **NullPool is the right pool for a PostgreSQL test engine.** Alembic already demonstrates this pattern (`alembic/env.py:59`). NullPool ensures each test checkout gets a fresh connection and there is no cross-test connection state — no StaticPool workaround needed.

3. **testcontainers[postgresql] is the right choice over a local service.** CI has no PostgreSQL; the app's PostgreSQL is embedded inside the backend Docker image (not a separate compose service). testcontainers spins a container per test session and is self-contained in both local and CI environments.

4. **The three-step ownership-check pattern is correct but opaque.** Raw `db.get()` + lazy-load + imperative check works but could be consolidated into a scoped query. This is a quality improvement, not a bug fix — out of scope for Phase 2 (Phase 2 tests the correctness, not the style).

5. **Alembic migrations vs. `create_all`.** The test fixture currently uses `Base.metadata.create_all()` (schema from models, bypassing migrations). For PostgreSQL, using `create_all` is still acceptable for the test fixture — it keeps tests fast and avoids migration-history coupling. If a migration has custom data logic, that is tested separately.

## Historical Context (from prior changes)

- `context/archive/2026-06-15-per-user-data-scoping/plan.md:264-286` — 403 guard pattern for every per-instance endpoint; established the `register_and_login` + `auth` test helpers
- `context/archive/2026-06-15-per-user-data-scoping/reviews/impl-review.md` — F4 flags StaticPool/xdist incompatibility; deferred to Phase 2
- `context/archive/2026-06-17-testing-recurrence-unit/` — Phase 1 done; `fresh_db_s2` pattern established in test_recurrence_service.py

## Related Research

- `context/foundation/test-plan.md` — Risk #3 (IDOR) and #4 (SQLite/PostgreSQL divergence) define Phase 2 scope
- `context/archive/2026-06-15-per-user-data-scoping/plan.md` — Ownership check implementation reference

## Open Questions

1. **Session isolation strategy for PostgreSQL:** Drop-all/create-all per test (current SQLite approach, simple but slower) vs. transaction rollback per test (faster, but requires care with DDL). Given the suite is 42 tests and runs in seconds, drop_all/create_all is acceptable for Phase 2.

2. **Unified session for service tests:** test_recurrence_service.py and test_reminder_job.py currently create their own `_DBSession()` instances directly. Should Phase 2 convert these to use a `db_session` fixture from conftest, or leave them with their own engines pointed at PostgreSQL? Converting is cleaner but is additional scope — the plan should make this call explicitly.

3. **CI update scope:** Does Phase 2 include updating `.github/workflows/ci.yml` to run tests against testcontainers PostgreSQL? Yes — this is the point of Phase 2; CI must use real PostgreSQL for the gate to have value.

4. **`delete_payment` IDOR test:** Phase 2 must add `test_delete_payment_other_user_returns_403` — this is the one missing cross-user coverage gap in the router.
