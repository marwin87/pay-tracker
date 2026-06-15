<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: .xlsx Export — Year-by-Month Spreadsheet Download

- **Plan**: context/changes/xlsx-export/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2)
- **Date**: 2026-06-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical / 4 warnings / 4 observations

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

### F1 — Revert feature shipped inside xlsx-export commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: backend/app/routers/bills.py:145, frontend/src/components/payments/PaymentRow.tsx, frontend/src/lib/payments-api.ts
- **Detail**: `POST /bills/payments/{id}/unpay`, `revertPay()`, and the `RotateCcw` icon button were not in the xlsx-export plan. They are documented in a separate `context/changes/revert-payment/change.md` but landed in the same commit as xlsx-export (`d066fd4`), blurring the change boundary. The revert feature itself is benign and low-risk.
- **Fix A ⭐ Recommended**: Accept as-is; the separate change.md is sufficient documentation
  - Strength: The revert feature is already documented and working; retroactive splitting is cosmetic churn.
  - Tradeoff: Future reviewers tracing the xlsx-export commit will see unrelated revert code.
  - Confidence: HIGH — the `revert-payment/change.md` makes the intent auditable.
  - Blind spot: None significant.
- **Fix B**: Retroactively note the bundling in xlsx-export change.md
  - Strength: Keeps change.md accurate as a record of what the commit actually touched.
  - Tradeoff: Minor edit; doesn't change git history.
  - Confidence: MED.
  - Blind spot: None.
- **Decision**: PENDING

### F2 — DB schema change violates xlsx-export plan boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: backend/alembic/versions/68cc4b807b16_add_start_period_to_bill_templates.py
- **Detail**: The plan explicitly stated "No changes to the DB schema or Alembic migrations." The `start_period VARCHAR(7)` column migration landed in the same commit. This migration supports recurrence seeding (preventing retroactive instance flooding for new bills), not xlsx export. The migration itself is a safe nullable addition with a proper `downgrade()`, but it crossed the stated scope boundary.
- **Fix A ⭐ Recommended**: Accept as-is; document in xlsx-export change.md that the migration was bundled
  - Strength: The migration is already applied and working; reverting it would require another migration and coordination.
  - Tradeoff: Plan boundary violation is now on record but not corrected in git.
  - Confidence: HIGH — migration is safe, nullable, reversible.
  - Blind spot: None significant.
- **Fix B**: Note the bundling only in xlsx-export change.md for auditability
  - Strength: Lightweight; clarifies what change.md covers.
  - Tradeoff: None.
  - Confidence: HIGH.
  - Blind spot: None.
- **Decision**: PENDING

### F3 — /unpay leaves dangling next-period instance

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/bills.py:145-179
- **Detail**: When `mark_paid` is called (`/pay`), it auto-generates the next period's `PaymentInstance` via `generate_next_instance()`. When `revert_payment` (`/unpay`) undoes the payment, it does NOT delete that auto-generated instance. So after pay → unpay, a next-period instance exists even though the payment was reverted. The `revert-payment/change.md` documents this as a deliberate decision ("Deleting it risks cascading data loss if the next month was already touched"), but if the next instance was freshly generated and untouched, leaving it dangling silently adds a phantom future payment to the user's view.
- **Fix A ⭐ Recommended**: Keep current behavior; add a code comment explaining the deliberate decision
  - Strength: Matches the documented decision in change.md; avoids cascading deletes that could remove a next-month instance the user has already modified.
  - Tradeoff: Dangling next-period instances after pay→unpay are a known UX rough edge; low frequency in practice.
  - Confidence: HIGH — the reasoning in change.md is sound; this is the right tradeoff for a household tracker.
  - Blind spot: Haven't measured how often users pay → immediately unpay in practice.
- **Fix B**: Delete the next-period instance only if it is in `upcoming` status with no modifications
  - Strength: Cleans up phantom instances in the common accidental-click case while preserving touched instances.
  - Tradeoff: Requires querying for the next-period instance; adds complexity; the "unmodified" check is tricky to define.
  - Confidence: MED — edge cases around "what counts as modified" are subtle.
  - Blind spot: Need to verify what fields `generate_next_instance` sets vs. what the user might edit.
- **Decision**: PENDING

### F4 — handleRevert silently swallows errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/payments/PaymentRow.tsx:30-37
- **Detail**: `handleRevert` catches nothing — if `revertPay()` throws (network error, 400/500 from server), the error is swallowed in the `finally` block. The spinner disappears and the UI goes back to normal with no feedback. The existing `MarkPaidDialog` component sets a local error state and displays it; `handleRevert` should follow the same pattern.
- **Fix**: Add a `catch` branch that sets a local `revertError` state and renders it as a tooltip or small inline message near the revert button.
  - Strength: Consistent with `MarkPaidDialog`'s established error pattern; prevents silent failures.
  - Tradeoff: Requires a new `revertError` state variable and a small rendering addition.
  - Confidence: HIGH — identical pattern already exists one component away.
  - Blind spot: None significant.
- **Decision**: PENDING

---

## Observations (no action required)

### O1 — Dead error display block in payments/page.tsx

- **Location**: frontend/src/app/dashboard/payments/page.tsx:173-175
- **Detail**: `{isLoadingThisYear && xlsxError && ...}` is never true — `xlsxLoadingYear` is set to `null` in the `finally` block before the component re-renders. The actual error display is on lines 180-182 (`{!xlsxLoadingYear && xlsxError}`). The block on 173-175 is dead code.
- **Note**: Remove lines 173-175 on next touch of this file to avoid confusion.

### O2 — year param unclamped in /export/xlsx

- **Location**: backend/app/routers/export.py:34
- **Detail**: `year` accepts any integer (e.g., `year=9999`). Results in a vacuous query and a 12-sheet empty workbook being rendered. Low practical risk for a household app.
- **Note**: Add `ge=2000, le=2100` to the `Query()` on next touch.

### O3 — start_period nullable with no backfill

- **Location**: backend/alembic/versions/68cc4b807b16_add_start_period_to_bill_templates.py:24
- **Detail**: Column is nullable but `create_bill` always sets it. Existing bills have `NULL`. If any future query filters/orders by `start_period` assuming non-null, existing rows will behave unexpectedly.
- **Note**: Acceptable for now since `recurrence.py` presumably guards against null. Add a backfill if a non-null constraint is added later.

### O4 — export-api.ts rolls its own auth instead of using apiFetch

- **Location**: frontend/src/lib/export-api.ts:1-22
- **Detail**: Justified because `apiFetch` is JSON-only. However, auth header injection and error handling diverge from the shared pattern — a 401 response returns "Export failed" instead of the server's `detail`. Low practical risk.
- **Note**: Consider extracting a shared `apiFetchRaw(url, options)` helper that returns the raw `Response` on next refactor pass.

## Automated Success Criteria

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ PASS — no output |
| `npm run lint` | ✅ PASS — no errors |
| All three locale files contain matching PaymentsPage export keys | ✅ PASS (confirmed by drift agent) |
| Backend mypy + import check | ✅ PASS (marked [x] in plan, confirmed by user during implementation) |

## Manual Success Criteria

All manual items marked `[x]` in plan Progress section — confirmed by user before commit.
