---
change_id: restore-deleted-future-instances
title: Restore deleted future instances on bill template save
status: archived
created: 2026-06-18
updated: 2026-06-18
archived_at: 2026-06-18T14:32:08Z
---

## Notes

### Problem

When a user deletes payment instances (single or "delete all future"), soft-deleted rows stay in the DB as tombstones. The recurrence engine in `recurrence.py` skips any `(bill_id, period)` pair that already has a row — even `is_deleted=True` — so no new instances are ever generated. The bill template remains visible and editable, but edits have no visible effect. Template is a "zombie."

### Solution

Keep soft-delete and the tombstone mechanism unchanged. When the user saves a template edit, detect if any tombstoned future instances exist and prompt:

> "Some future payments were previously deleted. Restore them with the updated values?"

- **Restore** → flip tombstones back to active (`is_deleted=False`) with the template's new `amount` and recalculated `due_date`
- **Skip** → save template normally, tombstones stay

---

### Backend

**1. New endpoint** `GET /bills/{bill_id}/has-deleted-future`  
Returns `{"has_deleted_future": bool}`. Checks for any `PaymentInstance` with `is_deleted=True` and `period >= current_month` for the given bill. Must be declared before `PATCH /{bill_id}` in the router.  
File: `backend/app/routers/bills.py`

**2. Schema change** — add to `BillTemplateUpdate`:
```python
recreate_deleted_future: bool = False
```
File: `backend/app/schemas/bill.py`

**3. PATCH handler** — after updating template fields, if `recreate_deleted_future=True`:
- Query all tombstoned instances for this bill with `period >= current_month`
- Set `is_deleted=False`, `status=upcoming`
- Update `amount` to `bill.amount` (already updated value)
- Update `due_date` via `_due_date_for_period(inst.period, bill.due_day)` (already updated value)

This block runs after `setattr` so it picks up the new template values.  
File: `backend/app/routers/bills.py`

---

### Frontend

**4. API client** — add `hasDeletedFuture(id)` and add `recreate_deleted_future?: boolean` to `BillTemplateUpdate`.  
File: `frontend/src/lib/bills-api.ts`

**5. New dialog** `RestoreDeletedDialog.tsx` — follows portal pattern from `ArchiveConfirmDialog.tsx`. Props: `billName`, `onRestore`, `onSkip`, `restoring`. Rendered into `document.body` via `createPortal`.  
File: `frontend/src/components/bills/RestoreDeletedDialog.tsx`

**6. Bills page** — add state:
- `deletedFutureMap: Record<number, boolean>` — populated lazily when a row is expanded (call `hasDeletedFuture` on toggle)
- `restoreTarget: { id: number; name: string; data: BillTemplateUpdate } | null`

In `handleUpdate`: if `deletedFutureMap[id]` is true, stash the pending save in `restoreTarget` and show the dialog instead of calling `updateBill` immediately.  
Add `handleRestoreConfirm` (calls `updateBill` with `recreate_deleted_future: true`) and `handleRestoreSkip` (calls without flag).  
File: `frontend/src/app/dashboard/bills/page.tsx`

**7. I18n** — add `RestoreDeletedDialog` key group to `en.json`, `pl.json`, `de.json`:
```json
"RestoreDeletedDialog": {
  "title": "Restore deleted payments?",
  "description": "Some future payments for {name} were previously deleted. Restore them with the updated template values?",
  "restore": "Restore",
  "skip": "Skip",
  "restoring": "Restoring…"
}
```

---

### Tests

New file: `backend/tests/test_bill_update_restore.py`

| # | Scenario | Assert |
|---|----------|--------|
| 1 | `has-deleted-future` — no tombstones | returns `false` |
| 2 | `has-deleted-future` — tombstone in current/future period | returns `true` |
| 3 | `has-deleted-future` — tombstone only in past period | returns `false` |
| 4 | PATCH `recreate=true` — tombstones restored | `is_deleted=False`, `status=upcoming` |
| 5 | PATCH `recreate=true` — restored instances get new `amount` | matches updated template |
| 6 | PATCH `recreate=true` — restored instances get recalculated `due_date` | matches new `due_day` |
| 7 | PATCH `recreate=false` — tombstones untouched | `is_deleted` stays `True` |
| 8 | PATCH `recreate=true` — no tombstones → no-op | template updates, no error |
| 9 | PATCH `recreate=true` — past tombstones not restored | only future periods affected |
| 10 | `has-deleted-future` — another user's bill | HTTP 404 |
| 11 | PATCH restore — another user's bill | HTTP 403 |