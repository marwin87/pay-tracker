# Extract PostgreSQL into its own Docker Compose Service — Plan Brief

> Full plan: `context/changes/postgres-service-extract/plan.md`

## What & Why

Extract PostgreSQL 17 from the backend container (where it runs alongside uvicorn under supervisord) into its own `postgres` service using the official `postgres:17` image. The backend image currently installs the full PGDG apt stack + supervisor, bloating the image and coupling the app process to the database process. Splitting them gives independent restarts, cleaner logs, and a significantly smaller backend image.

## Starting Point

`backend/Dockerfile` installs `postgresql-17` + `supervisor` via apt (~150-200 MB), and `entrypoint.sh` initializes the cluster on first start. `supervisord.conf` manages two programs: `[program:postgres]` and `[program:uvicorn]`. The `postgres_data` named volume is mounted into the backend container.

## Desired End State

Three separate Docker Compose services: `postgres` (official image, owns the volume), `backend` (Python only, ~13-line Dockerfile), `frontend`. The backend waits for postgres via `depends_on: condition: service_healthy` before Alembic runs. All three services start with `docker compose up --build` and the API is accessible at `http://localhost:8010/docs`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| PGDATA path / volume compat | Fresh start — default `/var/lib/postgresql/data` | Simpler; user elected to wipe old volume with `down -v` | Plan |
| DATABASE_URL hostname | Override in compose `environment` block (`@postgres:5432`) | Keeps `.env.example` at `localhost:5432` for non-Docker local dev | Plan |
| Backend startup command | Inline `CMD` in Dockerfile (no entrypoint script) | Deletes `entrypoint.sh` entirely; behavior visible in Dockerfile | Plan |
| Startup banner | Drop it | Uvicorn logs its own startup; banner was a supervisord artifact | Plan |

## Scope

**In scope:**
- `docker-compose.yml` — add `postgres` service, update `backend` service
- `backend/Dockerfile` — strip all postgres/supervisor installation, replace `ENTRYPOINT` with `CMD`
- `backend/supervisord.conf` — deleted
- `backend/entrypoint.sh` — deleted

**Out of scope:**
- No Python application code changes
- No schema migrations or data transformations
- No `.env.example` DATABASE_URL update

## Architecture / Approach

Compose networking: all three services share the default bridge network. Backend reaches postgres by service name (`postgres:5432`). The `environment` block in the backend service overrides `DATABASE_URL` from `.env` with the correct Docker hostname. The postgres service uses standard `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` env vars from `.env` for first-run init — no custom init scripts needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Reshape docker-compose.yml | postgres service + backend wired to it | Compose YAML syntax error if variable interpolation is off |
| 2. Slim Dockerfile + delete dead files | Backend image drops postgres/supervisor; entrypoint.sh gone | Missing a COPY or RUN line in the stripped Dockerfile |
| 3. End-to-end verify | Full stack starts clean with fresh volume | Volume permissions or PGDATA mismatch (mitigated by `down -v`) |

**Prerequisites:** Run `docker compose down -v` before the first build to clear the old volume.
**Estimated effort:** ~1 session, ~30 min of edits + build time.

## Open Risks & Assumptions

- `psycopg2-binary` bundles libpq — verified, no apt packages needed in the stripped image.
- The official `postgres:17` image's `pg_isready` is available for the healthcheck — standard in that image.
- Old volume data is abandoned (fresh start elected); no data migration needed.

## Success Criteria (Summary)

- `docker compose up --build` starts all three services without error and all show healthy/running.
- `http://localhost:8010/docs` returns HTTP 200 and Swagger UI loads.
- Backend logs confirm `alembic upgrade head` ran; postgres logs appear under the `postgres` container only.
