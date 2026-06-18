<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Restore Deleted Future Instances

- **Plan**: context/changes/restore-deleted-future-instances/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-18
- **Verdict**: APPROVED (all findings fixed during triage)
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — recreate_deleted_future passes through the setattr loop

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/bills.py:263
- **Detail**: model_dump(exclude_unset=True) included "recreate_deleted_future" in updates dict; the setattr loop would call setattr(bill, "recreate_deleted_future", True) on the ORM instance. Harmless today (no such column on BillTemplate) but would persist junk if a column were ever added.
- **Fix**: Added `updates.pop("recreate_deleted_future", None)` after the model_dump line.
- **Decision**: FIXED

### F2 — handleRestoreSkip dismisses dialog before the await resolves

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/app/dashboard/bills/page.tsx:94
- **Detail**: setRestoreTarget(null) fired before await doUpdate. On network error the dialog was already gone but the bill list was not refreshed — silent stale state. handleRestoreConfirm had the correct pattern.
- **Fix A ⭐**: Wrapped doUpdate in try/catch, moved setRestoreTarget(null) to success path only.
- **Decision**: FIXED via Fix A

### F3 — RestoreDeletedDialog (and ArchiveConfirmDialog) missing createPortal

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Pattern Consistency
- **Location**: frontend/src/components/bills/RestoreDeletedDialog.tsx:16
- **Detail**: Neither dialog used createPortal. The memory rule (Dialog portal rule) requires createPortal(…, document.body) for all modals. Current layout was safe but the pattern was violated in both dialogs.
- **Fix**: Added `createPortal` import and wrapped overlay in `createPortal(…, document.body)` in both RestoreDeletedDialog and ArchiveConfirmDialog.
- **Decision**: FIXED

### F4 — recreate_deleted_future not marked as transient in schema

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/app/schemas/bill.py:27
- **Detail**: recreate_deleted_future sat alongside persisted fields with no indication it is a control flag.
- **Fix**: Added inline comment `# transient control flag — not persisted`.
- **Decision**: FIXED
