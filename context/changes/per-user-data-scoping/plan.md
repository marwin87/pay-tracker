# Per-User Data Scoping — Implementation Plan

## Overview

Add `user_id` FK to `BillTemplate`, scope every bill/payment/export query to
`current_user.id`, update the recurrence service to receive `user_id` as an explicit
parameter, and bootstrap the backend test infrastructure with pytest. This closes the
data-isolation gap where any authenticated user can read or mutate any other user's
financial data (PRD FR-020, roadmap S-11).

## Current State Analysis

- `BillTemplate` has no `user_id` column. The bills router carries an explicit comment
  confirming the flat model was intentional (`bills.py:22-23`).
- Every endpoint in `bills.py` and `export.py` queries without user filtering.
- `ensure_current_period_instances()` in `recurrence.py:64` performs an unscoped
  `db.query(BillTemplate)` covering all users.
- Auth infrastructure is fully ready: `Depends(current_user)` returns a `User` object
  with `.id` at every endpoint — it is already injected but unused for scoping.
- Latest migration: `68cc4b807b16` (`down_revision: 632d778e4aa5`).
- No test infrastructure exists (`backend/tests/` is absent; `pyproject.toml` has no
  pytest dependency).

## Desired End State

- `bill_templates` table has `user_id INTEGER NOT NULL` FK → `users.id` ON DELETE CASCADE.
- Every bill/payment query filters by `BillTemplate.user_id == me.id`.
- Both export endpoints scope their output to the authenticated user.
- `ensure_current_period_instances(db, period, user_id)` only seeds instances for the
  given user's templates.
- `backend/tests/test_user_scoping.py` passes with pytest; 8 test functions confirm
  cross-user access returns 403 and list endpoints return only own data.

### Key Discoveries

- `generate_next_instance(db, template, paid_period)` — `recurrence.py:99` — receives
  the template object directly from the caller. No signature change needed: the template
  is already the correct user's by the time `mark_paid` validates ownership.
- `delete_payment` loads `template = instance.template` at `bills.py:192` before its
  delete logic. The 403 check goes immediately after that load.
- `list_payments` uses `joinedload(PaymentInstance.template)` at `bills.py:72`. When
  adding an explicit `.join(BillTemplate, ...)` for filtering, switch the options clause
  to `selectinload` to avoid SQLAlchemy join-strategy conflicts.
- JSON backup currently exports ALL users under a `"users"` key and queries all templates
  unscoped (`export.py:93-94`). The `"users"` key is removed; replaced by `"exported_by":
  me.email`; `schema_version` bumped to 2.
- No PostgreSQL-specific column types are used in the models — SQLite in-memory is safe
  for unit tests.

## What We're NOT Doing

- Adding `user_id` directly to `PaymentInstance` — scope is inherited transitively via
  `bill_id → BillTemplate.user_id`.
- Any frontend changes — the API contract is unchanged (same routes, same response
  schemas).
- A two-migration approach — data is dev/test only; a single migration with truncate
  is cleaner.
- Changing `generate_next_instance()` signature — it already operates on a specific
  template passed by the caller.

## Implementation Approach

Bottom-up: migration → model + service → bills router → export router → tests. Each
phase builds on the previous. The 403 guard pattern is uniform: fetch row by ID, check
ownership, raise 403 if mismatch. This order ensures the model change is in place before
any router or test references `BillTemplate.user_id`.

## Critical Implementation Details

**join vs joinedload conflict in list_payments** — SQLAlchemy raises a warning when an
explicit `.join(BillTemplate)` is combined with `.options(joinedload(PaymentInstance.template))`
on the same path. Switch the `options()` call to `selectinload(PaymentInstance.template)`
in `list_payments` when adding the explicit join filter.

**Truncate cascade order** — `op.execute("TRUNCATE TABLE bill_templates CASCADE")` in
the migration drops both `bill_templates` and `payment_instances` in one statement via
PostgreSQL cascade. Do not truncate `payment_instances` separately first; the CASCADE
handles it.

**403 location in mark_paid** — the template is already loaded at `bills.py:112-114`
before the commit. Insert the 403 check immediately after that load, before mutating
`instance.status`.

---

## Phase 1: Migration — add user_id FK

### Overview

Create a new Alembic migration that truncates existing rows and adds `user_id NOT NULL`
with FK and ON DELETE CASCADE to `bill_templates`. Autogenerate only the stub; rewrite
upgrade/downgrade manually (autogenerate won't add TRUNCATE or CASCADE).

### Changes Required

#### 1. Generate migration stub

**File**: `backend/alembic/versions/<new-revision>_add_user_id_to_bill_templates.py`
(generate via `docker compose exec backend uv run alembic revision --autogenerate -m "add_user_id_to_bill_templates"`)

**Intent**: Produce the revision file skeleton so Alembic chain is maintained; then
hand-edit upgrade/downgrade to match the truncate + FK pattern.

**Contract**:

```python
def upgrade() -> None:
    op.execute("TRUNCATE TABLE bill_templates CASCADE")
    op.add_column(
        "bill_templates",
        sa.Column("user_id", sa.Integer(), nullable=False),
    )
    op.create_foreign_key(
        "fk_bill_templates_user_id",
        "bill_templates",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

def downgrade() -> None:
    op.drop_constraint(
        "fk_bill_templates_user_id", "bill_templates", type_="foreignkey"
    )
    op.drop_column("bill_templates", "user_id")
```

### Success Criteria

#### Automated Verification

- `docker compose down -v && docker compose up --build` exits with no migration error
- `docker compose exec backend uv run alembic current` shows the new revision as head

#### Manual Verification

- `docker compose exec backend uv run alembic show head` confirms the correct revision
- `docker compose exec db psql -U postgres pay_tracker -c "\d bill_templates"` shows
  `user_id integer not null` with a FK constraint

**Implementation Note**: Pause after manual verification before proceeding to Phase 2.

---

## Phase 2: Model + service layer

### Overview

Wire the new `user_id` column into the SQLAlchemy model and add `user_id: int` to
`ensure_current_period_instances` in the recurrence service.

### Changes Required

#### 1. BillTemplate model

**File**: `backend/app/models/bill.py`

**Intent**: Add `user_id` mapped column and `user` relationship to `BillTemplate` so
the ORM reflects the new FK. Add `bills` back-reference to `User` so the relationship
is navigable from both sides.

**Contract**: In `BillTemplate` (after line 55, before `created_at`):
```python
user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
user: Mapped["User"] = relationship(back_populates="bills")
```
In `backend/app/models/user.py`, inside the `User` class:
```python
bills: Mapped[list["BillTemplate"]] = relationship(
    back_populates="user", cascade="all, delete-orphan"
)
```
Add `from __future__ import annotations` to both files if not already present to avoid
forward-reference errors.

#### 2. Recurrence service — add user_id parameter

**File**: `backend/app/services/recurrence.py`

**Intent**: Scope `ensure_current_period_instances` to a single user's templates by
accepting `user_id: int` and filtering the BillTemplate query accordingly.
`generate_next_instance` requires no change.

**Contract**: New signature:
```python
def ensure_current_period_instances(db: Session, period: str, user_id: int) -> None:
```
Add `BillTemplate.user_id == user_id` to the existing filter chain at line 68–71.

### Success Criteria

#### Automated Verification

- `docker compose exec backend uv run python -c "from app.models.bill import BillTemplate; print(BillTemplate.user_id)"` exits 0
- `docker compose exec backend uv run mypy app/models/ app/services/` exits 0

#### Manual Verification

- No import errors at app startup (`docker compose logs backend` shows uvicorn listening)

**Implementation Note**: Pause after automated verification passes before proceeding.

---

## Phase 3: Bills router — scope all endpoints

### Overview

Replace `_: User` with `me: User` everywhere, remove the flat-model comment, and add
user-scoping filters and 403 ownership checks to all 7 bill/payment endpoints.

### Changes Required

#### 1. Remove flat-model comment and convert parameter names

**File**: `backend/app/routers/bills.py:22-23, 31, 43, 59, 106, 149, 186, 214, 230`

**Intent**: Delete the PRD comment about the flat model (lines 22-23). At every endpoint
replace `_: User = Depends(current_user)` with `me: User = Depends(current_user)` so
`me.id` is accessible.

#### 2. `list_bills` — filter to current user

**File**: `backend/app/routers/bills.py:33`

**Intent**: Add `.filter(BillTemplate.user_id == me.id)` to the existing query so only
the current user's templates are returned.

#### 3. `create_bill` — assign ownership

**File**: `backend/app/routers/bills.py:46`

**Intent**: Pass `user_id=me.id` when constructing `BillTemplate(**body.model_dump(), ...)`.

#### 4. `list_payments` — scope query + thread user_id to seeder

**File**: `backend/app/routers/bills.py:68-76`

**Intent**: Pass `me.id` as third argument to `ensure_current_period_instances`. Switch
`joinedload` to `selectinload` and add an explicit `.join(BillTemplate, ...)` + `.filter(BillTemplate.user_id == me.id)` to the PaymentInstance query.

**Contract**:
```python
ensure_current_period_instances(db, month, me.id)

instances = (
    db.query(PaymentInstance)
    .options(selectinload(PaymentInstance.template))
    .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
    .filter(
        BillTemplate.user_id == me.id,
        PaymentInstance.period == month,
    )
    .order_by(PaymentInstance.due_date)
    .all()
)
```

#### 5. `mark_paid` — ownership check

**File**: `backend/app/routers/bills.py:112-114`

**Intent**: After the existing template load (`template = instance.template`), add a 403
guard: if `template.user_id != me.id` raise 403.

#### 6. `revert_payment` — ownership check

**File**: `backend/app/routers/bills.py:157`

**Intent**: After `template = instance.template`, add the same 403 guard as in mark_paid.

#### 7. `delete_payment` — ownership check

**File**: `backend/app/routers/bills.py:192`

**Intent**: After `template = instance.template`, add the same 403 guard before the
delete logic branches.

#### 8. `update_bill` — ownership check

**File**: `backend/app/routers/bills.py:216-218`

**Intent**: After the existing 404 check (`if not bill: raise 404`), add
`if bill.user_id != me.id: raise HTTPException(status_code=403, detail="Not authorized")`.

#### 9. `archive_bill` — ownership check

**File**: `backend/app/routers/bills.py:232-234`

**Intent**: Same 403 pattern as update_bill, after the 404 check.

### Success Criteria

#### Automated Verification

- `docker compose exec backend uv run python -c "from app.routers.bills import router"` exits 0
- Backend starts without error (`docker compose up` health check passes)

#### Manual Verification

- Register User A → create 2 bills → register User B → `GET /bills` returns `[]`
- User B `GET /bills/payments` returns `[]`
- User B `PATCH /bills/{User A's bill_id}` returns 403

**Implementation Note**: All three manual checks must pass before proceeding to Phase 4.

---

## Phase 4: Export router — scope both endpoints

### Overview

Scope `GET /export/xlsx` via JOIN through BillTemplate and scope `GET /export/json` by
filtering templates and instances. Update the JSON backup format: remove the `users` key,
add `exported_by`, bump `schema_version` to 2.

### Changes Required

#### 1. `export_xlsx` — scope via JOIN

**File**: `backend/app/routers/export.py:32-83`

**Intent**: Change `_: User` to `me: User`. Replace the unscoped PaymentInstance query
with one that JOINs BillTemplate and filters by `me.id`.

**Contract**:
```python
instances = (
    db.query(PaymentInstance)
    .options(selectinload(PaymentInstance.template))
    .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
    .filter(
        BillTemplate.user_id == me.id,
        PaymentInstance.period.startswith(f"{year}-"),
    )
    .order_by(PaymentInstance.due_date)
    .all()
)
```
Also add `selectinload` to the import from `sqlalchemy.orm`.

#### 2. `export_json` — scope queries + update format

**File**: `backend/app/routers/export.py:86-147`

**Intent**: Filter both queries to `me.id`. Replace the `"users"` array with
`"exported_by": me.email`. Bump `schema_version` to 2.

**Contract**:
```python
templates = db.query(BillTemplate).filter(BillTemplate.user_id == me.id).all()
template_ids = [t.id for t in templates]
instances = (
    db.query(PaymentInstance)
    .filter(PaymentInstance.bill_id.in_(template_ids))
    .all()
)
payload = {
    "schema_version": 2,
    "exported_by": me.email,
    "exported_at": datetime.now(timezone.utc).isoformat(),
    "bill_templates": [...],       # same per-template dict as before, minus user_id
    "payment_instances": [...],    # same per-instance dict as before
}
```
Remove the `"users"` key entirely.

### Success Criteria

#### Automated Verification

- Backend starts without import errors after the export.py change
- `uv run pytest backend/tests/test_user_scoping.py::test_export_json_scoped -v` passes

#### Manual Verification

- User A exports JSON → file contains `"exported_by": "a@test.com"`, no `"users"` key,
  `"schema_version": 2`, and only User A's templates
- User B exports JSON → `"bill_templates": []`, `"payment_instances": []`
- User A exports xlsx → file downloads successfully and contains only User A's data

**Implementation Note**: Pause after all manual checks pass before proceeding to Phase 5.

---

## Phase 5: Backend test infrastructure + user-scoping tests

### Overview

Bootstrap pytest + httpx as dev dependencies, create `conftest.py` with an in-memory
SQLite test database and HTTP test client, and write 8 test functions covering cross-user
isolation for every attack surface.

### Changes Required

#### 1. Add pytest + httpx to dev dependencies

**File**: `backend/pyproject.toml`

**Intent**: Add `pytest`, `pytest-anyio`, and `httpx` to `[dependency-groups].dev` so
the test suite can run inside the container.

**Contract**: Add to `[dependency-groups].dev`:
```toml
"pytest>=8.0",
"httpx>=0.28",
```

#### 2. Install new dev dependencies

**Contract**: `docker compose exec backend uv sync --dev` (or rebuild the container).

#### 3. Test database conftest

**File**: `backend/tests/__init__.py` (empty)

**File**: `backend/tests/conftest.py` (new)

**Intent**: Provide `app_client` and `auth_headers` fixtures. The test app uses the real
FastAPI app with an in-memory SQLite database replacing the PostgreSQL connection so tests
are self-contained and fast.

**Contract**: Override the `get_db` dependency with a SQLite in-memory session; call
`Base.metadata.create_all()` in the fixture setup. Expose a `make_user(email, password)`
helper that calls `POST /auth/register` and returns the bearer token.

#### 4. User-scoping test file

**File**: `backend/tests/test_user_scoping.py` (new)

**Intent**: 8 test functions asserting that User B cannot see or mutate User A's data.

**Tests**:
- `test_list_bills_scoped` — User B's `GET /bills` returns `[]` when User A owns all bills
- `test_list_payments_scoped` — User B's `GET /bills/payments` returns `[]`
- `test_mark_paid_other_user_returns_403` — User B `POST /bills/payments/{A_instance_id}/pay` → 403
- `test_revert_payment_other_user_returns_403` — User B unpay A's paid instance → 403
- `test_update_bill_other_user_returns_403` — User B `PATCH /bills/{A_bill_id}` → 403
- `test_archive_bill_other_user_returns_403` — User B `POST /bills/{A_bill_id}/archive` → 403
- `test_export_json_scoped` — User B's JSON export has `"bill_templates": []`, `"exported_by": "b@test.com"`
- `test_export_xlsx_scoped` — User B's xlsx export returns 200 (no crash when data is empty)

### Success Criteria

#### Automated Verification

- `docker compose exec backend uv run pytest tests/test_user_scoping.py -v` — all 8 pass
- `docker compose exec backend uv run pytest tests/ -v` — 0 failures

#### Manual Verification

- No regressions: User A can still create bills, mark payments, and export data normally

**Implementation Note**: Once all tests pass and no regressions in the manual flow, the
change is complete and ready for `/10x-archive`.

---

## Testing Strategy

### Unit / Integration Tests

- `backend/tests/test_user_scoping.py` — 8 tests covering every endpoint that can leak
  cross-user data (list bills, list payments, mark paid, unpay, delete, update, archive,
  json export, xlsx export)

### Manual Testing Steps

1. `docker compose down -v && docker compose up --build` — confirm migration applies
2. Register User A (`a@test.com`), create 2 bill templates, mark one paid
3. Register User B (`b@test.com`):
   - `GET /bills` → `[]`
   - `GET /bills/payments` → `[]`
   - `PATCH /bills/{User A's bill_id}` → 403
   - `POST /bills/{User A's bill_id}/archive` → 403
4. User A downloads JSON backup: `exported_by: "a@test.com"`, no `users` key, 2 templates
5. User B downloads JSON backup: `exported_by: "b@test.com"`, `bill_templates: []`

## Migration Notes

- Downgrade removes the `user_id` column but cannot restore truncated data. For a
  development rollback use `docker compose down -v && docker compose up --build`.
- The JSON backup `schema_version` is bumped from 1 to 2. The future S-09 restore slice
  must handle both v1 (legacy, unscoped) and v2 (per-user) formats if backward
  compatibility is required.

## References

- PRD FR-020: `context/foundation/prd.md`
- S-11 roadmap entry: `context/foundation/roadmap.md`
- Bills router: `backend/app/routers/bills.py`
- Export router: `backend/app/routers/export.py`
- Recurrence service: `backend/app/services/recurrence.py`
- BillTemplate model: `backend/app/models/bill.py`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Migration — add user_id FK

#### Automated

- [x] 1.1 `docker compose down -v && docker compose up --build` exits with no migration error
- [x] 1.2 `alembic current` shows new revision as head

#### Manual

- [x] 1.3 `\d bill_templates` in psql shows `user_id integer not null` with FK constraint

### Phase 2: Model + service layer

#### Automated

- [x] 2.1 `python -c "from app.models.bill import BillTemplate; print(BillTemplate.user_id)"` exits 0
- [x] 2.2 `mypy app/models/ app/services/` exits 0

#### Manual

- [ ] 2.3 No import errors at app startup

### Phase 3: Bills router — scope all endpoints

#### Automated

- [x] 3.1 `python -c "from app.routers.bills import router"` exits 0
- [x] 3.2 Backend starts without error (health check passes)

#### Manual

- [ ] 3.3 User B `GET /bills` returns `[]` when User A owns all bills
- [ ] 3.4 User B `GET /bills/payments` returns `[]`
- [ ] 3.5 User B `PATCH /bills/{User A's bill_id}` returns 403

### Phase 4: Export router — scope both endpoints

#### Automated

- [x] 4.1 Backend starts without import errors after export.py change
- [x] 4.2 `pytest tests/test_user_scoping.py::test_export_json_scoped` passes

#### Manual

- [ ] 4.3 User A JSON export has `exported_by`, no `users` key, only User A's templates
- [ ] 4.4 User B JSON export has `bill_templates: []`
- [ ] 4.5 User A xlsx export downloads successfully

### Phase 5: Backend test infrastructure + user-scoping tests

#### Automated

- [x] 5.1 `pytest tests/test_user_scoping.py -v` — all 8 pass
- [x] 5.2 `pytest tests/ -v` — 0 failures

#### Manual

- [ ] 5.3 User A can still create bills, mark payments, and export data (no regression)
