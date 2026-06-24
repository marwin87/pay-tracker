<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Extract PostgreSQL into its own Docker Compose service

- **Plan**: `context/changes/postgres-service-extract/plan.md`
- **Scope**: All phases (1–3)
- **Date**: 2026-06-24
- **Verdict**: NEEDS ATTENTION → resolved via triage
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — uv run rebuilds venv at every cold start

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/Dockerfile:14
- **Detail**: CMD uses `uv run alembic` / `uv run uvicorn`, which triggers uv's venv-validation at startup. Build-time venv has a stale python symlink at runtime, so uv discards it and re-downloads packages including dev deps (mypy, etc.) — adding 10–30s and network I/O to every cold start.
- **Fix**: Replace `uv run <cmd>` with `.venv/bin/alembic` and `.venv/bin/uvicorn` directly.
- **Decision**: FIXED — CMD now uses `.venv/bin/alembic` and `.venv/bin/uvicorn`

### F2 — `:-changeme` fallback hardcodes a weak password

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: docker-compose.yml:21
- **Detail**: `${POSTGRES_PASSWORD:-changeme}` in DATABASE_URL silently starts with a weak credential if .env is absent, while postgres (no fallback) would fail — inconsistent failure behaviour.
- **Fix**: Drop `:-changeme` from POSTGRES_PASSWORD fallback only.
- **Decision**: FIXED — DATABASE_URL now uses `${POSTGRES_PASSWORD}` with no fallback

### F3 — Healthcheck missing start_period

- **Severity**: 💬 OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: docker-compose.yml:9–13
- **Detail**: Without start_period, retries count immediately. On slow hosts or cold pulls, postgres may exhaust retries before it's ready.
- **Fix**: Add `start_period: 10s` to postgres healthcheck.
- **Decision**: FIXED — `start_period: 10s` added

### F4 — env_file on postgres leaks all secrets into that container

- **Severity**: 💬 OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: docker-compose.yml:6
- **Detail**: `env_file: .env` injects JWT_SECRET, SMTP_PASSWORD, etc. into the postgres container which only needs 3 vars.
- **Fix**: Replace env_file with explicit environment: block for POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB.
- **Decision**: FIXED — postgres service now uses explicit environment: with 3 vars only

### F5 — .env.example DATABASE_URL says localhost after extract

- **Severity**: 💬 OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: .env.example:4
- **Detail**: First-time contributors see localhost and wonder why Docker uses `postgres`. Plan correctly chose not to change the value; a comment clarifies.
- **Fix**: Add comment explaining compose environment: override takes precedence in Docker.
- **Decision**: FIXED — comment added above DATABASE_URL in .env.example

### F6 — No backend healthcheck; frontend depends_on is fire-and-forget

- **Severity**: 💬 OBSERVATION
- **Dimension**: Architecture
- **Location**: docker-compose.yml (frontend depends_on)
- **Detail**: Frontend uses simple list form `depends_on: - backend`, which doesn't wait for uvicorn to be ready — alembic migrations may still be running.
- **Fix**: Add backend healthcheck on GET /health and upgrade frontend depends_on to condition: service_healthy.
- **Decision**: FIXED — backend healthcheck added (GET /health, 10s interval, 30s start_period); frontend depends_on upgraded to service_healthy
