# Extract PostgreSQL into its own Docker Compose Service — Implementation Plan

## Overview

Move PostgreSQL 17 out of the `backend` container (where it runs under supervisord alongside uvicorn) into its own `postgres` service using the official `postgres:17` image. The backend image drops all postgres and supervisor installation, shrinking significantly. Docker Compose `depends_on` with a healthcheck replaces the `pg_isready` poll loop inside supervisord.

## Current State Analysis

PostgreSQL 17 is installed into `python:3.13-slim` via the PGDG apt repository, adding ~150-200 MB of packages. `supervisord` manages two processes (`[program:postgres]` and `[program:uvicorn]`) plus a startup banner. `entrypoint.sh` initializes the cluster on first start if `PG_VERSION` is absent. The `postgres_data` named volume is mounted into the backend container at `/var/lib/postgresql/17/main`.

**Key Discoveries:**

- `psycopg2-binary` is used (bundles its own libpq) — the stripped backend image needs zero apt packages beyond the `python:3.13-slim` base.
- `config.py` reads `DATABASE_URL` from env; the `.env.example` default is `localhost:5432`, correct for bare `uv run uvicorn` but wrong inside Docker networking.
- The official `postgres:17` image honors `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` env vars for first-run init — these are already in `.env.example`.
- The user chose **fresh start** (default `PGDATA=/var/lib/postgresql/data`); `docker compose down -v` is required before the first boot with the new config to clear the old volume.

## Desired End State

Three separate Docker Compose services: `postgres`, `backend`, `frontend`. The backend image contains only Python + app code. The postgres service initializes itself via official image init logic. `docker compose up --build` succeeds with all services healthy, Alembic migrations run automatically before uvicorn starts, and the API is accessible at `http://localhost:8010/docs`.

### Key Discoveries:

- `backend/Dockerfile` — 34 lines today; target ~13 lines after stripping.
- `backend/supervisord.conf` — fully deleted; no replacement needed.
- `backend/entrypoint.sh` — fully deleted; replaced by an inline `CMD` in the Dockerfile.
- `docker-compose.yml` — gains a `postgres` service and a backend `environment` override for `DATABASE_URL`.

## What We're NOT Doing

- Not changing any Python application code, schemas, or migrations.
- Not updating `.env.example`'s `DATABASE_URL` (it stays `localhost:5432` for non-Docker dev).
- Not setting a non-default `PGDATA` — the user elected a fresh-start, so the default `/var/lib/postgresql/data` is used.
- Not adding a `frontend` healthcheck or changing the frontend's `depends_on`.

## Implementation Approach

Two-phase file edit followed by a manual end-to-end verification. Phases 1 and 2 are independent edits that can be reviewed together before the first Docker build.

---

## Phase 1: Reshape docker-compose.yml

### Overview

Add a `postgres` service using the official image with a healthcheck. Update the `backend` service to depend on postgres being healthy and inject `DATABASE_URL` pointing to the `postgres` service name. Move the `postgres_data` volume mount from backend to postgres.

### Changes Required:

#### 1. Add `postgres` service

**File**: `docker-compose.yml`

**Intent**: Declare a standalone postgres service that initializes itself from the three standard env vars already in `.env`. A healthcheck lets the backend's `depends_on` block wait for a ready-to-accept-connections state rather than polling inside the container.

**Contract**: New top-level service under `services:`. Mount `postgres_data` at `/var/lib/postgresql/data` (official image default). The healthcheck runs `pg_isready -U ${POSTGRES_USER:-paytracker}` (available inside the official image).

```yaml
postgres:
  image: postgres:17
  container_name: postgres
  restart: unless-stopped
  env_file: .env
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-paytracker}"]
    interval: 5s
    timeout: 5s
    retries: 5
```

#### 2. Update `backend` service

**File**: `docker-compose.yml`

**Intent**: Remove the `postgres_data` volume from the backend (postgres owns it now). Add `depends_on` with `condition: service_healthy` so the backend waits for postgres before Alembic runs. Override `DATABASE_URL` in the environment block to use the Docker service name `postgres` instead of `localhost`.

**Contract**: Replace the existing `backend` service block. The `environment` key overrides `.env` for this one variable; all other settings continue to come from `env_file: .env`. Variable interpolation in the compose file resolves `${POSTGRES_USER}` etc. from `.env` at `docker compose up` time.

```yaml
backend:
  build: ./backend
  container_name: backend
  restart: unless-stopped
  env_file: .env
  environment:
    DATABASE_URL: "postgresql://${POSTGRES_USER:-paytracker}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/${POSTGRES_DB:-paytracker}"
  depends_on:
    postgres:
      condition: service_healthy
  ports:
    - "8010:8000"
```

### Success Criteria:

#### Automated Verification:

- `docker compose config` exits 0 and the output shows both `postgres` and `backend` services with the correct structure.

#### Manual Verification:

- Verified the compose file is valid YAML (no syntax errors) by visual inspection.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Slim Dockerfile + Delete Dead Files

### Overview

Strip all PostgreSQL 17 and supervisor installation from `backend/Dockerfile`. Replace the `ENTRYPOINT` reference to `entrypoint.sh` with an inline `CMD`. Delete `supervisord.conf` and `entrypoint.sh`.

### Changes Required:

#### 1. Rewrite `backend/Dockerfile`

**File**: `backend/Dockerfile`

**Intent**: Remove the entire `RUN apt-get update … postgresql-17 supervisor …` block, the `RUN mkdir -p … chown …` block, the `COPY supervisord.conf` line, and the `RUN chmod +x /app/entrypoint.sh` line. Replace `ENTRYPOINT ["/app/entrypoint.sh"]` with an inline CMD that runs Alembic then uvicorn.

**Contract**: The resulting Dockerfile must produce an image that starts uvicorn on port 8000. Alembic must run before uvicorn. No apt packages are needed — `psycopg2-binary` bundles libpq.

```dockerfile
FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

#### 2. Delete `backend/supervisord.conf`

**File**: `backend/supervisord.conf`

**Intent**: This file managed postgres and uvicorn as supervisord programs. With postgres in its own service and uvicorn started via CMD, it is dead code.

**Contract**: File deleted. No replacement.

#### 3. Delete `backend/entrypoint.sh`

**File**: `backend/entrypoint.sh`

**Intent**: The script initialized the PostgreSQL cluster on first start and handed off to supervisord. Both responsibilities are gone.

**Contract**: File deleted. No replacement.

### Success Criteria:

#### Automated Verification:

- `docker compose build backend` completes without error.
- Built image size is measurably smaller than before (target: under 500 MB vs. previous ~900+ MB).

#### Manual Verification:

- Deleted files no longer appear in `git status` as tracked (they appear as deleted).
- Dockerfile reads cleanly with no dead `COPY supervisord.conf` or `chmod` lines.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: End-to-End Verification

### Overview

Wipe the old volume, build fresh, and verify all three services start correctly and the full application works.

### Changes Required:

No code changes in this phase — verification only.

### Success Criteria:

#### Automated Verification:

- `docker compose down -v` exits 0 (wipes old `postgres_data` volume).
- `docker compose up --build` starts all three services without error.
- `docker compose ps` shows `postgres`, `backend`, `frontend` all in `running` state.
- `curl -s http://localhost:8010/health` or `http://localhost:8010/docs` returns HTTP 200.

#### Manual Verification:

- Swagger UI loads at `http://localhost:8010/docs`.
- Frontend loads at `http://localhost:3010` and can log in / list bills.
- Backend logs show `alembic upgrade head` completing before uvicorn starts.
- Postgres logs appear under the `postgres` container, not under `backend`.
- No supervisord references in any container log.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Manual Testing Steps:

1. Run `docker compose down -v` to clear the old volume.
2. Run `docker compose up --build` and watch for errors in all three services.
3. Confirm `docker compose ps` shows all services healthy/running.
4. Hit `http://localhost:8010/docs` — expect the Swagger UI.
5. Hit `http://localhost:3010` — log in, verify the bills list loads.
6. `docker compose logs backend | grep alembic` — confirm migrations ran.
7. `docker compose logs postgres` — confirm postgres initialized in its own container.

## Migration Notes

- **Fresh start required**: Run `docker compose down -v` before the first `docker compose up --build`. The old `postgres_data` volume has data at `/var/lib/postgresql/17/main`; the new postgres service writes to `/var/lib/postgresql/data`. Leaving the old volume in place causes postgres to initialize a new cluster on top, which is harmless but wastes space.
- **Local dev without Docker**: `DATABASE_URL` in `.env` stays `localhost:5432` — correct for `uv run uvicorn` without compose.

## References

- Change brief: `context/changes/postgres-service-extract/change.md`
- Backend Dockerfile: `backend/Dockerfile`
- Compose file: `docker-compose.yml`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Reshape docker-compose.yml

#### Automated

- [x] 1.1 `docker compose config` exits 0 and shows both services

#### Manual

- [x] 1.2 Compose file is valid YAML with correct structure (visual inspection)

### Phase 2: Slim Dockerfile + Delete Dead Files

#### Automated

- [x] 2.1 `docker compose build backend` completes without error
- [x] 2.2 Built image size is measurably smaller than before

#### Manual

- [x] 2.3 Deleted files no longer appear as tracked in git status
- [x] 2.4 Dockerfile reads cleanly with no dead lines

### Phase 3: End-to-End Verification

#### Automated

- [x] 3.1 `docker compose down -v` exits 0
- [x] 3.2 `docker compose up --build` starts all three services without error
- [x] 3.3 `docker compose ps` shows all three services running
- [x] 3.4 `curl http://localhost:8010/docs` returns HTTP 200

#### Manual

- [x] 3.5 Swagger UI loads at http://localhost:8010/docs
- [x] 3.6 Frontend loads at http://localhost:3010 and can log in / list bills
- [x] 3.7 Backend logs show alembic upgrade head before uvicorn
- [x] 3.8 Postgres logs appear under the postgres container, not backend
- [x] 3.9 No supervisord references in any container log
