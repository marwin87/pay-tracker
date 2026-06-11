# DB Schema Migration — Implementation Plan

## Overview

Generate the initial Alembic migration that creates the three core tables (`users`,
`bill_templates`, `payment_instances`) in PostgreSQL. Before running autogenerate,
fix two gaps in the existing SQLAlchemy models (missing `category` field, wrongly
named `auto_generate` flag) and add the missing idempotency constraint. Then update
all code that referenced the renamed field.

## Current State Analysis

Alembic is fully wired: `alembic/env.py` imports both model files, reads `DATABASE_URL`
from settings, and targets `Base.metadata`. Supervisord already calls
`uv run alembic upgrade head` on container start. The `alembic/versions/` folder is
empty — no revision exists yet.

Three models are defined in SQLAlchemy 2.0 style (`Mapped[T]` / `mapped_column()`):
`User` in `backend/app/models/user.py`, `BillTemplate` and `PaymentInstance` in
`backend/app/models/bill.py`.

Two model gaps were found against the PRD:
1. `BillTemplate` is missing a `category` field (FR-003, must-have).
2. `BillTemplate.auto_generate` is the paused flag with inverted semantics — the PRD
   and AGENTS.md always call it the "paused flag"; `auto_generate=False` means paused.
3. `PaymentInstance` has no `UNIQUE(bill_id, period)` constraint — required by AGENTS.md.

Six references to `auto_generate` exist across 4 files that must be updated in sync
with the model rename.

## Desired End State

- `bill_templates` table has `category VARCHAR(100)` (nullable) and `is_paused BOOLEAN DEFAULT FALSE`.
- `payment_instances` table has a `UNIQUE(bill_id, period)` DB-level constraint named
  `uq_payment_instance_bill_period`.
- No `auto_generate` identifier exists anywhere in the backend Python source.
- `alembic/versions/` contains exactly one revision file that creates all three tables.
- `docker compose up --build` starts cleanly; `alembic upgrade head` succeeds; all three
  tables are present in the `paytracker` database.

### Key Discoveries

- `backend/app/models/bill.py:35` — `auto_generate: Mapped[bool] = mapped_column(Boolean, default=True)` — rename + invert default to `False`.
- `backend/app/schemas/bill.py:12,21,34` — three `auto_generate` occurrences to rename.
- `backend/app/routers/bills.py:108` — `if instance.template.auto_generate:` — rename + invert to `if not instance.template.is_paused:`.
- `backend/app/routers/export.py:68` — `"auto_generate": t.auto_generate` — rename key and attribute.
- `UniqueConstraint` must be added to sqlalchemy imports in `models/bill.py`.
- PostgreSQL is co-located in the backend container; DB: `paytracker`, user: `paytracker`, port: 5432, volume: `postgres_data`.

## What We're NOT Doing

- Not adding a `user_id` FK to templates or instances — the PRD uses a flat access model (all authenticated users share one household view).
- Not creating any seeded/fixture data.
- Not adding migration tests — the DB constraint itself is the enforcement.
- Not changing any frontend code — this is backend-only.
- Not adding a `category` FK table — category is a free-text field per design decision.

## Implementation Approach

Phase 1 fixes all model and code issues together (they must land atomically — a model
with `is_paused` while routers still reference `auto_generate` will crash at import
time). Phase 2 generates the revision from the corrected models and verifies it applies.

## Critical Implementation Details

- **Semantics inversion on rename.** `auto_generate=True` (old default) meant "not paused." `is_paused=False` (new default) means the same thing. The logic guard in `bills.py:108` must flip: `if instance.template.auto_generate:` → `if not instance.template.is_paused:`.
- **UniqueConstraint import.** `UniqueConstraint` is not currently imported in `models/bill.py`; add it to the `from sqlalchemy import ...` line before using it in `__table_args__`.

---

## Phase 1: Model corrections and dependent code updates

### Overview

Fix the three model gaps and update the six `auto_generate` references so the codebase
is self-consistent before autogenerate runs.

### Changes Required

#### 1. SQLAlchemy models

**File:** `backend/app/models/bill.py`

**Intent:** Add the missing `category` field to `BillTemplate`, rename `auto_generate`
to `is_paused` with an inverted default, add a `UniqueConstraint` on `PaymentInstance`,
and import `UniqueConstraint`.

**Contract:**
- Add `UniqueConstraint` to the existing `from sqlalchemy import ...` line.
- On `BillTemplate`, add `category: Mapped[str | None] = mapped_column(String(100))` (place after `name`).
- Replace `auto_generate: Mapped[bool] = mapped_column(Boolean, default=True)` with `is_paused: Mapped[bool] = mapped_column(Boolean, default=False)`.
- On `PaymentInstance`, add `__table_args__ = (UniqueConstraint("bill_id", "period", name="uq_payment_instance_bill_period"),)`.

#### 2. Pydantic schemas

**File:** `backend/app/schemas/bill.py`

**Intent:** Mirror the model changes in all three schema classes so the API contract
stays in sync.

**Contract:**
- `BillTemplateCreate`: add `category: str | None = None`; replace `auto_generate: bool = True` with `is_paused: bool = False`.
- `BillTemplateUpdate`: add `category: str | None = None`; replace `auto_generate: bool | None = None` with `is_paused: bool | None = None`.
- `BillTemplateOut`: add `category: str | None`; replace `auto_generate: bool` with `is_paused: bool`.

#### 3. Bills router

**File:** `backend/app/routers/bills.py`

**Intent:** Update the recurrence guard so the inverted semantics are correct.

**Contract:** Lines 107–108 — replace the comment and condition:
```python
# auto-create next period instance unless template is paused
if not instance.template.is_paused:
```

#### 4. Export router

**File:** `backend/app/routers/export.py`

**Intent:** Keep the JSON backup export key aligned with the renamed field, and add
the `category` field that was missing from the export payload.

**Contract:** In the `bill_templates` list comprehension (lines 59–69), replace
`"auto_generate": t.auto_generate` with `"is_paused": t.is_paused` and add
`"category": t.category` to the dict.

### Success Criteria

#### Automated Verification

- No `auto_generate` identifier remains in any Python file under `backend/`: `grep -rn "auto_generate" backend/ --include="*.py"` returns empty.
- Models import cleanly: `cd backend && uv run python -c "from app.models.bill import BillTemplate, PaymentInstance; print('OK')"`.
- Backend linting passes: `cd frontend && npm run lint` (frontend unaffected; backend has no lint command but import check above covers it).

#### Manual Verification

- Read through the four changed files and confirm no stray `auto_generate` remains and the logic inversion on the guard (`if not instance.template.is_paused:`) is correct.

**Implementation Note:** After automated verification passes, pause here for manual
confirmation before proceeding to Phase 2.

---

## Phase 2: Generate, review, and verify the Alembic migration

### Overview

With the models correct, generate the autogenerate revision, inspect the DDL, apply
it, and confirm all three tables exist in the database.

### Changes Required

#### 1. Generate the revision

**File:** `backend/alembic/versions/<hash>_initial_schema.py` (created by Alembic)

**Intent:** Produce the initial migration from the current model state.

**Contract:** Run the autogenerate command from inside the running backend container:
```
docker compose exec backend uv run alembic revision --autogenerate -m "initial_schema"
```
This creates one file in `backend/alembic/versions/`. The file must contain `upgrade()`
and `downgrade()` functions. Commit this generated file unchanged — do not hand-edit it.

#### 2. Review the generated DDL

**File:** `backend/alembic/versions/<hash>_initial_schema.py`

**Intent:** Confirm the migration creates exactly what the models declare before applying.

**Contract:** Open the generated file and verify:
- `op.create_table("users", ...)` — columns: `id`, `email` (unique, indexed), `password_hash`, `is_active`, `created_at`.
- `op.create_table("bill_templates", ...)` — columns: `id`, `name`, `frequency`, `amount`, `due_day`, `category`, `notes`, `is_paused`, `is_archived`, `auto_generate` must NOT appear, `created_at`.
- `op.create_table("payment_instances", ...)` — columns: `id`, `bill_id` (FK), `period`, `due_date`, `amount`, `status`, `paid_at`, `paid_amount`, `notes`, `created_at`; plus a `UniqueConstraint` on `(bill_id, period)`.

#### 3. Apply and verify

**Intent:** Confirm the migration runs to completion and the tables are queryable.

**Contract:** Rebuild the stack and check tables:
```
docker compose down -v && docker compose up --build
```
After startup, confirm tables exist:
```
docker compose exec backend uv run python -c "
from app.core.database import engine
from sqlalchemy import inspect
insp = inspect(engine)
print(insp.get_table_names())
"
```
Expected output includes `users`, `bill_templates`, `payment_instances`.

### Success Criteria

#### Automated Verification

- `backend/alembic/versions/` contains exactly one `.py` file after generation.
- `docker compose up --build` exits cleanly (no migration errors in backend logs).
- Table inspection returns all three table names.
- Unique constraint present: `docker compose exec backend uv run python -c "from sqlalchemy import inspect; from app.core.database import engine; insp = inspect(engine); print([c for c in insp.get_unique_constraints('payment_instances')])"` includes `uq_payment_instance_bill_period`.

#### Manual Verification

- `docker compose exec backend uv run alembic current` reports the revision as head.
- API docs at `http://localhost:8010/docs` load without errors (confirms backend started correctly after migration).

**Implementation Note:** After all automated verification passes, pause here for manual
confirmation that the backend boots cleanly and the API docs load.

---

## Testing Strategy

### Automated Tests

No unit tests are written for this foundation slice — the DB constraint itself is the
enforcement. The `grep` and import checks in Phase 1 plus the table inspection in
Phase 2 are the automated surface.

### Manual Testing Steps

1. After Phase 1: read the four changed files and confirm semantics are correct.
2. After Phase 2: verify `docker compose up --build` succeeds with no error lines
   containing "alembic" or "migration" in the backend log.
3. Hit `http://localhost:8010/docs` and confirm the `/bills` and `/export` endpoints
   appear with `is_paused` (not `auto_generate`) in their schemas.

## Migration Notes

This is the initial migration — no existing data. `docker compose down -v` wipes the
`postgres_data` volume before `up --build` to ensure a clean run. For subsequent
changes to the schema, follow the AGENTS.md pattern: generate a new revision with
`alembic revision --autogenerate -m "<desc>"` — never edit an existing revision.

## References

- Roadmap F-01: `context/foundation/roadmap.md`
- Model file: `backend/app/models/bill.py`
- Schemas: `backend/app/schemas/bill.py`
- Bills router: `backend/app/routers/bills.py`
- Export router: `backend/app/routers/export.py`
- Alembic env: `backend/alembic/env.py`
- AGENTS.md hard rule: idempotency key is `(bill_id, period)`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Model corrections and dependent code updates

#### Automated

- [x] 1.1 No `auto_generate` identifier remains: `grep -rn "auto_generate" backend/ --include="*.py"` returns empty
- [x] 1.2 Models import cleanly: `cd backend && uv run python -c "from app.models.bill import BillTemplate, PaymentInstance; print('OK')"`

#### Manual

- [x] 1.3 Read through four changed files; confirm no stray `auto_generate` and guard inversion is correct

### Phase 2: Generate, review, and verify the Alembic migration

#### Automated

- [x] 2.1 `backend/alembic/versions/` contains exactly one `.py` file
- [x] 2.2 `docker compose up --build` exits cleanly (no migration errors in backend logs)
- [x] 2.3 Table inspection returns `users`, `bill_templates`, `payment_instances`
- [x] 2.4 Unique constraint `uq_payment_instance_bill_period` present on `payment_instances`

#### Manual

- [ ] 2.5 `alembic current` reports the revision as head
- [ ] 2.6 `http://localhost:8010/docs` loads; `/bills` schema shows `is_paused` (not `auto_generate`)
