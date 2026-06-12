<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Core Payment Tracking Loop

- **Plan**: context/changes/core-payment-tracking-loop/plan.md
- **Scope**: All phases (full plan review)
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION (all findings resolved before close)
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (after fixes) |
| Architecture | PASS |
| Pattern Consistency | PASS (after fixes) |
| Success Criteria | PASS |

## Findings

### F1 — N+1 queries in list_payments

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/bills.py — list_payments
- **Detail**: Each PaymentInstance accessed `instance.template` triggering a separate SELECT. 20 bills = 21 queries.
- **Fix**: Added `joinedload(PaymentInstance.template)` to the list_payments query.
- **Decision**: FIXED

### F2 — Stale loading state on month switch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: frontend/src/app/dashboard/payments/page.tsx
- **Detail**: `loading` remained `false` between month changes, briefly showing stale data. Synchronous `setLoading(true)` inside useEffect triggered `react-hooks/set-state-in-effect` ESLint error.
- **Fix**: Replaced `loading` boolean state with derived `loading = loadedMonth !== selectedMonth`. Flips to `true` on same render when `selectedMonth` changes — no setState in useEffect needed.
- **Decision**: FIXED

### F3 — Frequency scheduling anchored to created_at only

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/recurrence.py
- **Detail**: `_bill_active_in_period` used `created_at` as anchor, causing timezone off-by-one for UTC+ users (Poland, Germany) creating bills late at night. Also, `created_at` drifts if rows are migrated.
- **Fix**: Added `start_period: Mapped[str | None] = mapped_column(String(7))` to BillTemplate. Set at creation from UTC `YYYY-MM`. `_bill_active_in_period` uses `start_period` with `created_at` as fallback for pre-existing rows.
- **Decision**: FIXED

### F4 — Unmount race in DeletePaymentDialog

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/payments/DeletePaymentDialog.tsx
- **Detail**: `onDeleted` called after component could unmount, potentially updating state on an unmounted component.
- **Fix**: Added mounted-ref pattern (`useRef(true)` + cleanup effect).
- **Decision**: FIXED

### F5 — Plan progress notes for future-month seeding

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: context/changes/core-payment-tracking-loop/plan.md
- **Detail**: Plan said "future months not seeded" but implementation seeds on demand when navigating forward.
- **Fix**: Updated "What We're NOT Doing" to reflect actual behavior.
- **Decision**: FIXED

### F6 — Plan notes for delete behavior

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: context/changes/core-payment-tracking-loop/plan.md
- **Detail**: Delete behavior (archive template + delete current+future instances) not fully captured in plan.
- **Fix**: Updated plan notes to document actual delete semantics.
- **Decision**: FIXED

### F7 — BillFrequency inline import

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: backend/app/routers/bills.py — delete_payment
- **Detail**: `from app.models.bill import BillFrequency as BF` was inside function body rather than at module level.
- **Fix**: Moved to module-level import alongside other model imports. Fixed as part of F1.
- **Decision**: FIXED

### F8 — DeletePaymentDialog coupled to BillTemplateForm i18n namespace

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture
- **Location**: frontend/src/components/payments/DeletePaymentDialog.tsx
- **Detail**: Dialog depended on `BillTemplateForm.frequency.*` namespace — fragile if BillTemplateForm restructures.
- **Fix**: Created shared `Frequencies` namespace in all three locale files. DeletePaymentDialog uses `useTranslations("Frequencies")`.
- **Decision**: FIXED

### F9 — parseFloat at call site for markPaid

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/lib/payments-api.ts
- **Detail**: `markPaid` was called with `parseFloat(paidAmount)` at every call site; conversion should live inside the function.
- **Fix**: `markPaid` now takes `paidAmount: string`; `parseFloat` moved inside the function.
- **Decision**: FIXED

### F10 — Unmount race in MarkPaidDialog

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/payments/MarkPaidDialog.tsx
- **Detail**: Same pattern as F4 — missing mounted-ref guard.
- **Fix**: Added mounted-ref pattern.
- **Decision**: FIXED
