---
change_id: postgres-service-extract
title: Extract PostgreSQL into its own Docker Compose service
status: archived
created: 2026-06-24
updated: 2026-06-24
planned: 2026-06-24
implemented: 2026-06-24
archived_at: 2026-06-24T12:06:20Z
---

## Notes

Currently PostgreSQL 17 runs inside the `backend` container, managed by `supervisord` alongside `uvicorn`. This is a single point of failure (one crash takes down both app and DB), prevents horizontal scaling, pollutes logs, bloats the backend image (~400-500 MB of postgres packages on top of `python:3.13-slim`), and makes independent restarts impossible.

Fix: move postgres to its own service using the official `postgres:17` image. The backend image drops all postgres/supervisor installation and the `entrypoint.sh`. The `supervisord.conf` goes away. Docker Compose `depends_on` + a healthcheck on the postgres service replaces the `pg_isready` poll loop. The named volume `postgres_data` remounts to the postgres service — existing local data carries over with no migration needed.

Files affected:
- `backend/Dockerfile` — remove postgres 17 + supervisor install, pg_dropcluster, initdb setup, entrypoint wiring
- `backend/supervisord.conf` — deleted
- `backend/entrypoint.sh` — deleted (or replaced with a trivial `alembic upgrade head && uvicorn ...` one-liner)
- `docker-compose.yml` — add `postgres` service (official image), update `backend` env/depends_on/healthcheck, keep `postgres_data` volume
