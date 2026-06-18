# Restore Deleted Future Instances on Bill Template Save

## Overview

When a user deletes payment instances (single or "delete all future"), soft-deleted rows remain as tombstones. The recurrence engine skips any `(bill_id, period)` pair that already has a row — even with `is_deleted=True` — so no new instances are ever generated. The template remains editable but silently produces nothing ("zombie" state).

The fix: when the user saves a template edit and deleted future instances exist for that bill, intercept the save and ask: "Some future payments were previously deleted. Restore them with the updated values?" The tombstone mechanism is left intact; restore is an explicit opt-in.

## Current State Analysis

- Soft-delete tombstone rule is load-bearing and documented in `context/foundation/lessons.md:29-35`. Must not be changed.
- `ensure_current_period_instances` (`backend/app/services/recurrence.py:64-98`) skips a period if any row exists for `(bill_id, period)` — deleted or not.
- `PATCH /bills/{bill_id}` already propagates `due_day` changes to unpaid, non-deleted instances (`backend/app/routers/bills.py:224-257`). The restore block follows the same pattern.
- `POST /bills/{bill_id}/archive` is an existing parameterized sub-route. The new `GET /{bill_id}/has-deleted-future` follows the same pattern — no ordering concern.
- Frontend portal pattern established in `ArchiveConfirmDialog.tsx` — `RestoreDeletedDialog` follows it exactly.
- Test infrastructure: PostgreSQL testcontainers via `conftest.py`; `test_delete_payment.py` is the direct structural model.

## Desired End State

- User edits a bill template and saves → if that bill has any `is_deleted=True` instances with `period >= current_month`, a dialog appears asking whether to restore them.
- Choosing **Restore**: PATCH is called with `recreate_deleted_future=true`; all matching tombstones become active with the template's updated `amount` and recalculated `due_date`.
- Choosing **Skip**: PATCH is called normally; tombstones remain.
- No dialog appears when no tombstones exist — normal save flow is unchanged.

### Key Discoveries

- No DB migration needed — `is_deleted` already exists on `PaymentInstance`.
- `BillTemplateUpdate` uses `model_dump(exclude_unset=True)` — the new `recreate_deleted_future: bool = False` field is omitted unless explicitly sent (safe default).
- The restore block must run **after** the `setattr` loop in `update_bill` so it reads the already-updated `bill.amount` and `bill.due_day`.
- Restored instances should be set to `status=upcoming` regardless of `due_date` — `list_payments` already computes overdue dynamically in the response layer.
- One-off bills are included (user may need to restore an accidentally-deleted one-off entry).
- Paused templates: restore prompt appears regardless — pause stops auto-generation, not explicit user action.
- `has-deleted-future` fetch failure on form open: treat as no tombstones, fail silently.

## What We're NOT Doing

- Not changing the soft-delete tombstone mechanism.
- Not pre-generating future periods that were never created — only restoring existing tombstoned rows.
- Not auto-refreshing the payments page after save (bills-list refresh only, per existing pattern).
- Not adding a shared test fixture factory — follow `test_delete_payment.py` directly.

## Implementation Approach

Three-phase delivery: backend (endpoint + schema + handler logic) → frontend (API client + dialog + page wiring + i18n) → tests. Each phase is independently verifiable.

---

## Phase 1: Backend

### Overview

New read endpoint to check for tombstones, one field added to the update schema, and ~10 lines of restore logic appended to the existing PATCH handler.

### Changes Required

#### 1. New endpoint — `GET /bills/{bill_id}/has-deleted-future`

**File**: `backend/app/routers/bills.py`

**Intent**: Return `{"has_deleted_future": bool}` — true if the bill has any `PaymentInstance` row with `is_deleted=True` and `period >= current_month`. Authorised to the bill's owner only (404 if not found or not owned).

**Contract**: Place this route before `PATCH /{bill_id}` in the router file. Response body is a plain dict `{"has_deleted_future": bool}`. Uses `date.today().strftime("%Y-%m")` for the period boundary. Auth pattern: same as `archive_bill` — `db.get` + user_id check.

#### 2. Schema — `BillTemplateUpdate`

**File**: `backend/app/schemas/bill.py`

**Intent**: Add an opt-in flag the frontend sends when the user chooses to restore.

**Contract**: Add `recreate_deleted_future: bool = False` to `BillTemplateUpdate`. Because `update_bill` calls `body.model_dump(exclude_unset=True)`, this field is absent from `updates` unless the client explicitly sends it — existing saves are unaffected.

#### 3. Restore logic in `update_bill`

**File**: `backend/app/routers/bills.py`, `update_bill` function

**Intent**: After the template fields are updated, restore all tombstoned future instances with the new template values when the flag is set.

**Contract**: Append after the existing `due_day_changed` block and before `db.commit()`:

```python
if body.recreate_deleted_future:
    current_period = date.today().strftime("%Y-%m")
    tombstones = db.query(PaymentInstance).filter(
        PaymentInstance.bill_id == bill.id,
        PaymentInstance.is_deleted.is_(True),
        PaymentInstance.period >= current_period,
    ).all()
    for inst in tombstones:
        inst.is_deleted = False
        inst.amount = bill.amount
        inst.due_date = _due_date_for_period(inst.period, bill.due_day)
        inst.status = PaymentStatus.upcoming
```

The snippet is load-bearing here because the ordering constraint (runs after `setattr`, before `db.commit()`) and the status choice (`upcoming`, not dynamic) are non-obvious. Restore runs inside the same transaction as the template update.

### Success Criteria

#### Automated Verification

- `docker compose exec backend uv run pytest backend/tests/ -x -q` — all existing tests pass
- `GET /bills/{id}/has-deleted-future` returns 200 with `{"has_deleted_future": false}` for a bill with no tombstones (curl or http client)
- `GET /bills/{id}/has-deleted-future` returns `{"has_deleted_future": true}` for a bill with a current-period tombstone
- `PATCH /bills/{id}` with `{"recreate_deleted_future": true}` restores tombstones (verify via direct DB query or payment list endpoint)

#### Manual Verification

- Confirm existing delete flow (single + delete_future) is unaffected
- Confirm template PATCH without the flag leaves tombstones intact

**Pause here for manual confirmation before proceeding to Phase 2.**

---

## Phase 2: Frontend + I18n

### Overview

API client gains a `hasDeletedFuture` function; a new `RestoreDeletedDialog` component intercepts the save flow; `BillsPage` lazily fetches tombstone state on form open and routes the save through the dialog when needed. I18n keys added to all three locale files.

### Changes Required

#### 4. API client

**File**: `frontend/src/lib/bills-api.ts`

**Intent**: Expose the new backend endpoint and allow `recreate_deleted_future` to be sent with updates.

**Contract**:
- Add `hasDeletedFuture(id: number): Promise<{ has_deleted_future: boolean }>` — GET to `/bills/${id}/has-deleted-future`.
- Add `recreate_deleted_future?: boolean` to the `BillTemplateUpdate` type. `updateBill` already serializes via `JSON.stringify(data)` — no other change needed there.

#### 5. New dialog — `RestoreDeletedDialog.tsx`

**File**: `frontend/src/components/bills/RestoreDeletedDialog.tsx`

**Intent**: Show a confirmation dialog asking whether to restore deleted future payments. Rendered into `document.body` via `createPortal` (same pattern as `ArchiveConfirmDialog.tsx`).

**Contract**: Props: `billName: string`, `onRestore: () => void`, `onSkip: () => void`, `restoring: boolean`. Uses `useTranslations("RestoreDeletedDialog")`. Renders two buttons: **Restore** (primary action, disabled while `restoring`) and **Skip** (secondary). No "Cancel" — both paths proceed with the save.

#### 6. Bills page wiring

**File**: `frontend/src/app/dashboard/bills/page.tsx`

**Intent**: Lazily fetch tombstone state when an edit form opens; intercept the save handler to show `RestoreDeletedDialog` when tombstones exist; route the confirmed save to the right `updateBill` call.

**Contract**:
- Add state: `deletedFutureMap: Record<number, boolean>` (init `{}`).
- Add state: `restoreTarget: { id: number; name: string; data: BillTemplateUpdate } | null` (init `null`).
- Add state: `restoring: boolean` (init `false`).
- In `toggleExpand(id)`: when expanding a numeric id (not `"new"`), call `hasDeletedFuture(id)` in a try/catch; on success store result in `deletedFutureMap[id]`; on error leave map entry absent (treated as false downstream).
- Replace `handleUpdate`: if `deletedFutureMap[id]` is truthy, set `restoreTarget` and return without calling `updateBill`. Otherwise proceed normally.
- Add `handleRestoreConfirm`: calls `updateBill` with `{ ...restoreTarget.data, recreate_deleted_future: true }`, then clears `restoreTarget`, closes form, refreshes. Uses `restoring` flag to disable the button during the call.
- Add `handleRestoreSkip`: calls `updateBill` with `restoreTarget.data` (no flag), then clears `restoreTarget`, closes form, refreshes.
- After either path completes, remove the entry from `deletedFutureMap` so the next form open re-fetches fresh state.
- Render `<RestoreDeletedDialog>` (via portal) when `restoreTarget !== null`.

#### 7. I18n keys

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent**: Provide localised strings for the restore dialog.

**Contract**: Add the following key group to each file under the top-level object:

```json
"RestoreDeletedDialog": {
  "title": "Restore deleted payments?",
  "description": "Some future payments for {name} were previously deleted. Restore them with the updated template values?",
  "restore": "Restore",
  "skip": "Skip",
  "restoring": "Restoring…"
}
```

Translate `pl.json` and `de.json` appropriately (don't copy English verbatim).

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` — no new errors
- TypeScript: no `any`, no type errors on new state shapes

#### Manual Verification

- Create a monthly bill; view the payments page to seed an instance; delete it with "delete all future"
- Navigate to Bills page; expand that bill's edit form — check DevTools Network for the `has-deleted-future` request returning `true`
- Change the amount; click Save → `RestoreDeletedDialog` appears with correct bill name
- Click **Restore** → dialog closes, bills list refreshes; navigate to payments page and confirm restored instances show with the new amount
- Repeat the delete → edit flow; click **Skip** → template updates normally; payments page shows no restored entries

**Pause here for manual confirmation before proceeding to Phase 3.**

---

## Phase 3: Tests

### Overview

New test file following `test_delete_payment.py` exactly — same fixture imports, same PostgreSQL testcontainer, no new shared factories. 11 test cases covering the new endpoint and restore flag.

### Changes Required

#### 8. New test file

**File**: `backend/tests/test_bill_update_restore.py`

**Intent**: Verify the new endpoint and restore logic in isolation and combination.

**Contract**: Import `client`, `auth_headers`, `db_session` from `conftest`. Each test creates its own bill + instance state. Test list:

| # | Scenario | Assert |
|---|----------|--------|
| 1 | `has-deleted-future` — bill with no instances | `{"has_deleted_future": false}` |
| 2 | `has-deleted-future` — tombstone in current period | `{"has_deleted_future": true}` |
| 3 | `has-deleted-future` — tombstone only in a past period | `{"has_deleted_future": false}` |
| 4 | PATCH `recreate_deleted_future=true` — tombstone restored | `is_deleted=False`, `status=upcoming` in DB |
| 5 | PATCH `recreate_deleted_future=true` — restored instance gets updated `amount` | `inst.amount == new_amount` |
| 6 | PATCH `recreate_deleted_future=true` — restored instance gets recalculated `due_date` | `inst.due_date == _due_date_for_period(period, new_due_day)` |
| 7 | PATCH `recreate_deleted_future=false` (default) — tombstone untouched | `is_deleted` stays `True` |
| 8 | PATCH `recreate_deleted_future=true` — no tombstones → no-op | 200, template updated, no error |
| 9 | PATCH `recreate_deleted_future=true` — past tombstone not restored | past-period row stays `is_deleted=True` |
| 10 | `has-deleted-future` — another user's bill | HTTP 404 |
| 11 | PATCH restore — another user's bill | HTTP 403 |

### Success Criteria

#### Automated Verification

- `docker compose exec backend uv run pytest backend/tests/test_bill_update_restore.py -v` — all 11 pass
- `docker compose exec backend uv run pytest backend/tests/ -q` — full suite still green

#### Manual Verification

- Review test output for any skipped or xfailed tests

---

## Testing Strategy

### Unit / Integration Tests

All tests live in `test_bill_update_restore.py` and run against a real PostgreSQL testcontainer (no mocks). Edge cases covered: past tombstones, no tombstones, cross-user auth, amount + due_date sync.

### Manual Testing Steps

See Phase 2 Manual Verification above for the golden path. Additional edge cases to check manually:
1. Paused template with tombstones — restore prompt still appears, restore works
2. One-off bill with deleted entry — restore prompt appears and works
3. Edit form opened, `has-deleted-future` call fails (disable network in DevTools) — save proceeds normally, no dialog

## References

- Soft-delete tombstone rule: `context/foundation/lessons.md:29-35`
- Delete endpoint: `backend/app/routers/bills.py:196-221`
- Recurrence engine: `backend/app/services/recurrence.py:64-98`
- Portal dialog pattern: `frontend/src/components/bills/ArchiveConfirmDialog.tsx`
- Test model: `backend/tests/test_delete_payment.py`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend

#### Automated

- [x] 1.1 All existing backend tests pass after changes
- [x] 1.2 `GET /bills/{id}/has-deleted-future` returns correct bool for no-tombstone and tombstone cases

#### Manual

- [x] 1.3 Existing delete flow (single + delete_future) unaffected
- [x] 1.4 PATCH without flag leaves tombstones intact

### Phase 2: Frontend + I18n

#### Automated

- [x] 2.1 `npm run lint` passes with no new errors
- [x] 2.2 No TypeScript errors on new state shapes

#### Manual

- [x] 2.3 `has-deleted-future` request fires in DevTools when edit form opens for a bill with tombstones
- [x] 2.4 RestoreDeletedDialog appears on save when tombstones exist
- [x] 2.5 Restore path: instances reappear in payments view with updated amount
- [x] 2.6 Skip path: template updates, tombstones stay, payments view unchanged

### Phase 3: Tests

#### Automated

- [x] 3.1 All 11 tests in `test_bill_update_restore.py` pass
- [x] 3.2 Full backend test suite still green