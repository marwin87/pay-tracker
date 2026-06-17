# PostgreSQL Integration Baseline — Plan Brief

> Full plan: `context/changes/testing-postgresql-integration/plan.md`
> Research: `context/changes/testing-postgresql-integration/research.md`

## What & Why

Replace the SQLite StaticPool test infrastructure with real PostgreSQL via testcontainers and add the one missing IDOR test for `delete_payment`. This is Phase 2 of the test rollout (test-plan.md): Risk #3 (per-instance IDOR) and Risk #4 (SQLite-vs-PostgreSQL divergence) cannot be protected against while tests run on SQLite.

## Starting Point

42 tests across 6 files, all running against SQLite in-memory with StaticPool. Three separate module-level engines (conftest.py, test_recurrence_service.py, test_reminder_job.py) that must all be migrated. The IDOR ownership check for `DELETE /bills/payments/{instance_id}` exists in code but has no cross-user test.

## Desired End State

43 tests, all passing against a real PostgreSQL 17 container (testcontainers, session-scoped, Docker on ubuntu-latest). One shared `postgres_engine` fixture in conftest.py; `db_session` and `db_sessionmaker` companions for service/job tests; `client` fixture updated for HTTP tests. CI's `backend-tests` job exercises real PostgreSQL automatically with no ci.yml changes needed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Session isolation | `drop_all`/`create_all` per test | Identical to current pattern; negligible overhead at 42 tests | Plan |
| Engine consolidation | Full unification — one shared `postgres_engine` in conftest | Single source of truth; future pool/schema changes touch one place | Plan |
| PostgreSQL provider | `testcontainers[postgresql]` | Self-contained — same experience locally and in CI; no ci.yml service block needed | Plan |
| Container scope | Session-scoped (one container for all tests) | Avoids 42× container startup; ~3-5s overhead once | Plan |
| IDOR delete test scope | 403 status code only | Consistent with all 4 existing IDOR tests in test_user_scoping.py | Plan |
| CI changes | None | ubuntu-latest has Docker; testcontainers handles the rest | Research |

## Scope

**In scope:**
- `backend/pyproject.toml` — add `testcontainers[postgresql]>=4.0` and `psycopg2-binary` to dev deps
- `backend/tests/conftest.py` — full rewrite with `postgres_engine`, `db_tables`, `db_session`, `db_sessionmaker`, updated `client`
- `backend/tests/test_recurrence_service.py` — remove local engine/autouse; refactor 12 DB-backed tests to `db_session`
- `backend/tests/test_reminder_job.py` — remove local engine/autouse; refactor 8 tests to `db_session` + `db_sessionmaker`
- `backend/tests/test_user_scoping.py` — add `test_delete_payment_other_user_returns_403`

**Out of scope:**
- `test_email_service.py` (no DB engine, no migration needed)
- Changing any test assertion logic
- Alembic migrations in tests (keep `create_all`)
- pytest-xdist parallelization
- Router ownership-check refactoring
- Any `ci.yml` changes

## Architecture / Approach

One session-scoped testcontainers PostgreSQL container feeds a NullPool engine. Function-scoped `db_tables` fixture owns schema create/drop per test. `db_session` (yields a session) and `db_sessionmaker` (yields the factory class) both depend on `db_tables` — pytest deduplicates it, so schema is created once per test even when both are requested. The `client` fixture for HTTP tests manages its own schema lifecycle independently. The reminder job tests' key constraint: `send_daily_reminders` takes a sessionmaker class, not a session — `db_sessionmaker` is the drop-in replacement; `db_session.expire_all()` is required after the service call to see its committed changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. PostgreSQL fixture foundation | New conftest.py + deps; HTTP tests pass on PostgreSQL | testcontainers API changes between 3.x and 4.x — use `>=4.0` and verify `get_connection_url()` |
| 2. Migrate test_recurrence_service.py | 16 service tests on PostgreSQL; two-session pattern collapsed to one | `expire_on_commit=True` (SQLAlchemy default) must hold — if tests set `expire_on_commit=False`, re-fetch pattern breaks |
| 3. Migrate test_reminder_job.py | 8 job tests on PostgreSQL; `db_sessionmaker` wired | `expire_all()` before verification queries — easy to forget |
| 4. IDOR delete test + full suite | 43/43 green; delete endpoint coverage closed | None — straightforward copy of existing IDOR test shape |

**Prerequisites:** Docker available in the dev environment (needed for testcontainers locally). `uv` installed.  
**Estimated effort:** ~1 session (phases are mechanical once conftest.py is right).

## Open Risks & Assumptions

- testcontainers 4.x `PostgresContainer("postgres:17").get_connection_url()` returns a URL compatible with SQLAlchemy + psycopg2-binary. If the URL scheme differs (e.g., `postgresql+psycopg2` vs `postgresql`), SQLAlchemy's `create_engine` handles both.
- `send_daily_reminders` accepts the sessionmaker class as its first positional argument — confirmed from test call sites (`test_reminder_job.py:102,120,146`). If the signature changes, Phase 3 will surface it immediately.

## Success Criteria (Summary)

- `uv run pytest tests/ -v` — 43/43 pass, PostgreSQL container startup visible in output
- `grep -rn "StaticPool" backend/tests/` — returns empty
- `test_delete_payment_other_user_returns_403` appears by name in the test output
