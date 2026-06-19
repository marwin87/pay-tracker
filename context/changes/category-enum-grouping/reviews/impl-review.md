<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Category Enum & Grouping

- **Plan**: context/changes/category-enum-grouping/plan.md
- **Scope**: All Phases (1–3)
- **Date**: 2026-06-19
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  3 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — readOnly={false} hardcoded in PaymentRow call

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/app/dashboard/payments/page.tsx:299
- **Detail**: PaymentRow receives `readOnly={false}` as a literal instead of `isReadOnly` computed at line 57. Past-month payment rows show the "Mark as Paid" button. `isReadOnly` is still used for the "pastMonth" badge (line 238) and the "Add Bills" empty-state link (line 317).
- **Fix**: Change `readOnly={false}` to `readOnly={isReadOnly}`.
- **Decision**: ACCEPTED — past-month payments are intentionally editable; `isReadOnly` remains for badge + empty-state link only.

### F2 — CATEGORY_ORDER uses alphabetical order, not plan's domain order

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/lib/categories.ts:3–13
- **Detail**: Plan specified housing-first domain order. Actual is alphabetical (education, entertainment, healthcare, housing…). All three grouped pages follow this array.
- **Fix A ⭐ Recommended**: Restore plan order.
- **Fix B**: Accept alphabetical as intentional.
- **Decision**: ACCEPTED (Fix B) — alphabetical order is intentional.

### F3 — PaymentRow.tsx "Due Today" badge bundled into this commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: frontend/src/components/payments/PaymentRow.tsx:137–140
- **Detail**: Orange "Due Today" badge added to PaymentRow, unrelated to category enum work. Safe, pure presentational.
- **Fix**: Accept as-is.
- **Decision**: ACCEPTED — safe change, already committed.

### F4 — BillTemplateRow collapsed header shows no category label

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/components/bills/BillTemplateRow.tsx:54–106
- **Detail**: Plan said to replace raw category text with translated label. Instead, no category shown at all. Intentional — grouping provides category context; per-row label is redundant.
- **Fix**: Accept as intentional.
- **Decision**: ACCEPTED — intentional design decision; grouping makes per-row label redundant.

### F5 — BillCategory union and CATEGORY_ORDER are independent (no exhaustiveness check)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: frontend/src/lib/bills-api.ts:5–14, frontend/src/lib/categories.ts:3–13
- **Detail**: TypeScript union and CATEGORY_ORDER array were independent — adding a category to one wouldn't enforce updating the other, causing silent drops from grouped renders.
- **Fix**: Derive `BillCategory` type from `CATEGORY_ORDER` array (`as const` + `typeof CATEGORY_ORDER[number]`).
- **Decision**: FIXED — categories.ts is now the source of truth; BillCategory derived from the array. Lint passes.
