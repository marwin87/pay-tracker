# DB Schema Migration — Plan Brief

> Full plan: `context/changes/db-schema-migration/plan.md`

## What & Why

Generate the initial Alembic migration that creates all three core tables in PostgreSQL.
Before running autogenerate, two model gaps must be fixed (missing `category` field on
`BillTemplate`, wrong name/semantics on the paused flag) and a missing idempotency
constraint must be added — the roadmap explicitly flagged that these gaps would surface
at this step.

## Starting Point

Alembic is fully wired (`env.py` imports models, reads `DATABASE_URL`, targets
`Base.metadata`), supervisord already calls `alembic upgrade head` on container start,
and the three SQLAlchemy models are ~95% complete — but `alembic/versions/` is empty,
so the tables don't exist yet.

## Desired End State

`docker compose up --build` starts cleanly; `users`, `bill_templates`, and
`payment_instances` tables exist in PostgreSQL with the correct columns and constraints;
`bill_templates` has `category` and `is_paused`; `payment_instances` enforces
`UNIQUE(bill_id, period)` at the DB level; no `auto_generate` identifier remains
anywhere in the backend source.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| `category` column type | `String(100)`, nullable | PRD never enumerates valid values; free-text is most flexible for a personal tool | Plan |
| Paused flag naming | Rename `auto_generate` → `is_paused`, default `False` | Aligns with PRD and AGENTS.md language; removes semantic inversion before any downstream code is written | Plan |
| Idempotency constraint | `UNIQUE(bill_id, period)` at DB level | AGENTS.md hard rule: enforce at DB, not only application level | Roadmap / AGENTS.md |
| User FK on templates | None | PRD flat access model: all authenticated users share one household view | Roadmap / PRD |

## Scope

**In scope:**
- Fix `BillTemplate` model: add `category`, rename `auto_generate` → `is_paused`
- Fix `PaymentInstance` model: add `UniqueConstraint("bill_id", "period")`
- Update 6 `auto_generate` references across schemas, bills router, and export router
- Generate one Alembic autogenerate revision
- Verify migration applies and all tables exist

**Out of scope:**
- Seed/fixture data
- Migration tests
- Any frontend changes
- `category` FK lookup table (free-text only)

## Architecture / Approach

Pure backend schema work. Phase 1 fixes all model + code issues atomically (model
and code must land together — a renamed model field crashes at import if routers still
reference the old name). Phase 2 generates the revision from the corrected state and
verifies end-to-end with a clean docker compose rebuild.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Model + code corrections | All model gaps fixed; no `auto_generate` in source | Logic inversion on the paused guard (`if not is_paused:`) must be manually verified |
| 2. Generate & verify migration | Revision file created; tables exist in DB; alembic at head | autogenerate may miss or misname columns if models aren't cleanly importable — Phase 1's import check catches this |

**Prerequisites:** Docker Compose stack must be startable (`docker compose up` must not error on non-DB issues before this plan runs).

**Estimated effort:** ~1 focused session; 2 short phases.

## Open Risks & Assumptions

- Autogenerate may emit extra DDL if SQLAlchemy's type mapping for `Numeric(12,2)` or `String(20)` enums differs from what Alembic expects — review the generated file before applying.
- `recurrence.py` was not read in full; it may reference `auto_generate` indirectly. The Phase 1 `grep` check will catch any missed reference.

## Success Criteria (Summary)

- `grep -rn "auto_generate" backend/ --include="*.py"` returns empty
- `docker compose up --build` starts without migration errors
- All three tables present with correct constraints; `http://localhost:8010/docs` loads and shows `is_paused` in bill schemas
