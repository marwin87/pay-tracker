<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: DB Schema Migration

- **Plan**: context/changes/db-schema-migration/plan.md
- **Scope**: All phases (Phase 1 + Phase 2)
- **Date**: 2026-06-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Template captured before commit in mark_paid

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/bills.py (mark_paid)
- **Detail**: `instance.template` must be read before `db.commit()` because SQLAlchemy expires all attributes on commit (expire_on_commit=True default). Original code accessed `instance.template.is_paused` after commit, triggering a DetachedInstanceError or lazy-load on an expired session.
- **Fix**: Assign `template = instance.template` before `db.commit()` and use `template.is_paused` in the post-commit guard.
- **Decision**: FIXED

### F2 — Flat access model not documented at the router

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: backend/app/routers/bills.py
- **Detail**: The PRD §Access Control mandates a flat household model. Without a comment, future contributors may add `user_id` scoping as an apparent "security fix," breaking the intended design.
- **Fix**: Add a two-line comment above `router = APIRouter(...)` referencing PRD §Access Control and explaining that `_: User = Depends(current_user)` is auth-only, not scoping.
- **Decision**: FIXED

### F3 — PATCH update_bill uses exclude_none instead of exclude_unset

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/bills.py (update_bill)
- **Detail**: `body.model_dump(exclude_none=True)` prevents clearing nullable fields (e.g., setting `due_day` or `notes` back to null). Clients that send `{"notes": null}` to clear a note would have the null silently ignored. `exclude_unset=True` is the correct Pydantic PATCH idiom.
- **Fix**: Change to `body.model_dump(exclude_unset=True)`.
- **Decision**: FIXED

### F4 — N+1 query on template relationship in export_xlsx

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py (export_xlsx)
- **Detail**: `i.template.name` inside the list comprehension triggers a separate SELECT per row when instances are many. For a household with 100+ payment records this adds 100+ round-trips.
- **Fix**: Add `options(selectinload(PaymentInstance.template))` to the query.
- **Decision**: FIXED

### F5 — export_json missing category and is_paused fields

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: backend/app/routers/export.py (export_json)
- **Detail**: The plan's Phase 1 contract required adding `"category": t.category` and renaming `"auto_generate"` to `"is_paused"` in the JSON export payload. The rename was applied but `category` was not included, making backup/restore incomplete.
- **Fix**: Add `"category": t.category` to the bill_templates dict in export_json.
- **Decision**: FIXED

### F6 — Flat model comment missing (observation, now added)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/app/routers/bills.py:19-21
- **Detail**: Two-line comment referencing PRD §Access Control added above router definition to prevent future misinterpretation of the intentionally flat access model.
- **Decision**: FIXED (comment added)

### F7 — Route ordering latent shadowing risk

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/app/routers/bills.py
- **Detail**: `GET /payments` and `POST /payments/{instance_id}/pay` were declared after `PATCH /{bill_id}` and `POST /{bill_id}/archive`. No current bug (different methods), but if `GET /{bill_id}` were ever added before the reorder, FastAPI would match "payments" as an integer bill_id first. Reordering eliminates the latent trap.
- **Decision**: FIXED (routes reordered — literal paths before parameterized)

### F8 — Enum .value missing in JSON export

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py (export_json)
- **Detail**: `t.frequency` and `i.status` are `str(Enum)` subclasses. In the JSON payload they serialize as `"BillFrequency.monthly"` instead of `"monthly"` / `"paid"` unless `.value` is appended. This would break any restore tooling that expects raw string values.
- **Decision**: FIXED

### F9 — No pagination on list_bills and list_payments (observation, skipped)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/bills.py
- **Detail**: Both list endpoints return unbounded result sets. For a household with years of history this could grow large. Not a launch blocker given the PRD's household scope.
- **Decision**: SKIPPED — acceptable for household scope; add if data grows

### F10 — No created_at in PaymentInstanceOut schema

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: backend/app/schemas/bill.py (PaymentInstanceOut)
- **Detail**: The model has `created_at` but the schema omits it. Not a bug (API callers don't need it now), but worth noting for debugging/audit use cases.
- **Decision**: SKIPPED — not needed by any current consumer
