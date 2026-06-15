---
id: revert-payment
title: Revert payment — undo accidental "Mark as Paid"
status: implemented
created: 2026-06-15
updated: 2026-06-15
prd_refs: []
roadmap_id: null
prerequisites:
  - S-03 (core payment tracking loop)
---

## Summary

User can revert an accidentally marked-as-paid payment instance back to its
natural unpaid state (upcoming or overdue) via an icon button in the payment
row, without going through a confirmation dialog.

## What was built

### Backend — `POST /bills/payments/{instance_id}/unpay`

- New endpoint in `backend/app/routers/bills.py`
- Guards: 404 if instance not found; 400 if instance is not currently `paid`
- Clears `paid_at` and `paid_amount` (sets both to `None`)
- Resets `status` to `overdue` if `due_date < today`, otherwise `upcoming`
- Does **not** delete the auto-generated next-period instance that was created
  when the payment was originally marked paid — removing it could cause data
  loss if that next instance was itself already paid or modified
- Returns the updated `PaymentInstanceOut` (same shape as `/pay`)

### Frontend

- `frontend/src/lib/payments-api.ts` — `revertPay(instanceId)` calling
  `POST /bills/payments/{id}/unpay`
- `frontend/src/components/payments/PaymentRow.tsx` — grayed `RotateCcw` icon
  button with browser tooltip (`title` + `aria-label`) from the `revert`
  translation key; shown only when `instance.status === "paid"`; spins
  (`Loader2`) while the request is in-flight; no confirmation dialog (the
  action is easily reversible — user can mark paid again)
- Row layout: `[Mark as Paid]` or `[↺ revert icon]` → thin vertical separator
  → `[🗑 delete]`; delete is always last
- `frontend/src/app/dashboard/payments/page.tsx` — `handleInstanceReverted`
  updates the instance in-place in the list (same pattern as `handleInstancePaid`)
- i18n keys added to EN / PL / DE under `PaymentRow.revert`:
  - EN: "Revert payment"
  - PL: "Cofnij płatność"
  - DE: "Zahlung rückgängig machen"

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Confirmation dialog | No | Action is trivially reversible (mark paid again); dialog adds friction for an accidental-click recovery flow |
| Next-period instance on revert | Keep it | Deleting it risks cascading data loss if the next month was already touched |
| Status after revert | `overdue` if past due, else `upcoming` | Mirrors the dynamic status logic already used in `list_payments` |
| Revert availability | All paid instances, including past months | Accidents can happen in any month; `readOnly` only guards against creating new paid entries |
