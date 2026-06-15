# Per-User Data Scoping — Plan Brief

> Full plan: `context/changes/per-user-data-scoping/plan.md`

## What & Why

Every authenticated user can currently read and mutate every other user's bill templates
and payment instances — the backend was deliberately built as a flat household model.
This change adds a `user_id` FK to `BillTemplate` and scopes every query in the bills
and export routers to the authenticated user, closing a security gap that makes User A's
financial data visible to User B (PRD FR-020).

## Starting Point

`BillTemplate` has no `user_id` column. The bills router carries an explicit comment
confirming the flat model (`bills.py:22-23`). Auth infrastructure is solid — `Depends(current_user)` returns a `User` object with `.id` at every endpoint, but `.id` is never used for filtering. No test infrastructure exists.

## Desired End State

User A creates bill templates and payment instances. User B logs in and sees nothing —
empty list on `GET /bills`, `GET /bills/payments`, and 403 on any attempt to mutate User
A's resources. Both export endpoints return only the authenticated user's data. An 8-test
pytest suite verifies these guarantees automatically.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Existing rows | Truncate bill_templates CASCADE | Data is dev/test only; clean slate is simpler than arbitrary owner assignment | Plan |
| Unauthorized access response | 403 Forbidden (when found, wrong owner) | More informative than 404 for debugging; user accepted the enumeration tradeoff | Plan |
| Recurrence service scoping | Pass `user_id: int` to `ensure_current_period_instances` | Explicit parameter is testable and doesn't hide coupling in callers | Plan |
| FK on delete | CASCADE | Consistent with "user owns their data"; no user-delete endpoint exists today anyway | Plan |
| Empty xlsx export | Return empty file with headers | Avoids a new 204 response code the frontend doesn't handle | Plan |
| JSON backup format | `exported_by: email` + remove `users` key; `schema_version: 2` | No internal IDs in the export; human-readable owner identification | Plan |
| Test database | SQLite in-memory | No PostgreSQL-specific column types in models; keeps tests self-contained and fast | Plan |

## Scope

**In scope:**
- Alembic migration: truncate + add `user_id` NOT NULL FK ON DELETE CASCADE
- `BillTemplate` model + `User` back-reference
- `ensure_current_period_instances` signature (`user_id: int` added)
- All 7 endpoints in `bills.py` (list, create, list-payments, pay, unpay, delete, update, archive)
- Both endpoints in `export.py` (xlsx, json)
- pytest bootstrap + 8-test user-scoping suite

**Out of scope:**
- `PaymentInstance.user_id` — scope is inherited via `bill_id → BillTemplate.user_id`
- Frontend changes — API contract unchanged
- `generate_next_instance()` signature — receives template directly, already scoped by caller
- S-09 restore backward-compatibility — noted in migration notes; not built here

## Architecture / Approach

Single-pass bottom-up: migration → model + service → bills router → export router → tests.
The 403 guard pattern is applied uniformly at every endpoint that accepts a resource ID:
fetch row, check `row.user_id == me.id` (or `row.template.user_id == me.id` for instances),
raise 403 if mismatch. `PaymentInstance` queries that previously queried the table directly
now JOIN through `BillTemplate` and filter on `BillTemplate.user_id`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration | `user_id NOT NULL` FK live on `bill_templates`; existing data truncated | Autogenerate won't write the TRUNCATE — upgrade must be manually edited |
| 2. Model + service | ORM reflects new column; recurrence seeder accepts `user_id` | Forward-reference errors if `from __future__ import annotations` is missing |
| 3. Bills router | All 7 endpoints scoped; 403 guards on ID-based endpoints | `joinedload` / explicit `join` conflict in `list_payments` — must use `selectinload` |
| 4. Export router | xlsx and json output scoped to current user; JSON format v2 | `bill_id.in_([])` with empty list must be tested (no crash on empty template set) |
| 5. Tests | 8 pytest functions auto-verify isolation guarantees | No test infra exists — pytest + httpx must be added to dev deps first |

**Prerequisites:** Docker running; Phase 1 migration applied before any other phase starts.
**Estimated effort:** ~1–2 sessions across 5 phases; phases 3 and 4 are the largest.

## Open Risks & Assumptions

- `bill_id.in_([])` in `export_json` when the user has no templates — SQLAlchemy generates
  `WHERE bill_id IN (NULL)` which returns empty set correctly in SQLite and PostgreSQL;
  verify in tests.
- SQLite lacks `TRUNCATE` — migration runs against PostgreSQL only; the `op.execute("TRUNCATE ...")` in the migration is not exercised by the in-memory SQLite test DB (tests bypass migrations via `Base.metadata.create_all`).
- S-09 (restore) will need to parse `schema_version: 2` JSON; noted in migration notes but not handled here.

## Success Criteria (Summary)

- `docker compose down -v && docker compose up --build` applies the migration cleanly with no errors
- User B sees `[]` on `GET /bills` and 403 on any attempt to touch User A's resources
- `pytest tests/test_user_scoping.py -v` — all 8 pass, 0 failures
