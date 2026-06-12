<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bill Template Management

- **Plan**: context/changes/bill-template-management/plan.md
- **Scope**: Full plan (all phases)
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 7 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Dashboard layout has no auth guard

- **Severity**: ❌ CRITICAL (treated as WARNING — quick fix applied)
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: frontend/src/app/dashboard/layout.tsx
- **Detail**: Dashboard was accessible without authentication. Any unauthenticated user could reach /dashboard/bills by navigating directly.
- **Fix Applied**: Added `useEffect` auth guard + `if (!isAuthenticated) return null` early return to dashboard layout.
- **Decision**: FIXED via Fix A

### F2 — Archived bills page has no back navigation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/app/dashboard/bills/archived/page.tsx
- **Detail**: No link back to the active bills page. Users had to use browser history.
- **Fix Applied**: Added `← Active bills` Link above the h1.
- **Decision**: FIXED

### F3 — ThemeToggle hydration mismatch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/ThemeToggle.tsx
- **Detail**: Lazy initializer reads `document.documentElement.classList` on the server where it's undefined, causing a React hydration mismatch warning.
- **Fix Applied**: Added `suppressHydrationWarning` to the toggle button element.
- **Decision**: FIXED

### F4 — ArchiveConfirmDialog missing ARIA attributes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/bills/ArchiveConfirmDialog.tsx
- **Detail**: Dialog overlay lacked `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape key handler, and `autoFocus` on the cancel button.
- **Fix Applied**: Added all ARIA attributes and keyboard handler.
- **Decision**: FIXED

### F5 — BillTemplateForm inputs missing id/htmlFor

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/bills/BillTemplateForm.tsx:128–219
- **Detail**: Labels used implicit wrapping instead of explicit `htmlFor`/`id` pairing. Login page uses explicit association; the form should match.
- **Fix Applied**: Added `id=` to all inputs/select/textarea and `htmlFor=` to all labels. Updated CategoryCombobox to accept and forward the `id` prop.
- **Decision**: FIXED

### F6 — BillTemplateRow Edit/Archive buttons use title= instead of aria-label=

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/bills/BillTemplateRow.tsx:68,76
- **Detail**: `title=` provides a tooltip but not an accessible name for screen readers when the visible text is hidden on mobile. `aria-label=` is the correct attribute.
- **Fix Applied**: Replaced `title=` with `aria-label=` on both buttons. Edit button label is dynamic (`"Close"` when expanded, `"Edit"` when collapsed).
- **Decision**: FIXED

### F7 — handleArchiveConfirm has no double-submit guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/app/dashboard/bills/page.tsx (handleArchiveConfirm)
- **Detail**: Two rapid clicks on Archive could fire two DELETE requests. The second hits a 404 and surfaces as an unhandled error.
- **Fix Applied**: Added `archiving` boolean state; guard in `handleArchiveConfirm`; disabled + "Archiving…" label on the Archive confirm button while in-flight.
- **Decision**: FIXED via Fix A

### F8 — handleChange setter-identity comparison is fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/bills/BillTemplateForm.tsx:77–89
- **Detail**: Live-validation helper compares `setter === setName` to build the `next` snapshot. Relies on React setter referential stability (de facto stable, not a documented API contract). Adding a new field requires extending the snapshot or validation silently misses it.
- **Fix Applied**: Added inline comment explaining the setter-identity pattern.
- **Decision**: FIXED via Fix A

### F9 — JWT stored in localStorage (pre-existing)

- **Severity**: ⚠️ WARNING (pre-existing)
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/api.ts (auth-context.tsx / localStorage)
- **Detail**: JWT access token stored in localStorage is accessible to any JavaScript on the page (XSS risk). HttpOnly cookies are the standard mitigation. Pre-existing architectural decision — not introduced by this change.
- **Decision**: RECORDED AS LESSON (context/foundation/lessons.md)

### F10 — CategoryCombobox datalist id was a global singleton

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/bills/CategoryCombobox.tsx
- **Detail**: Hardcoded `id="bill-categories"` would collide if two instances were rendered on the same page. Partially resolved by F5 (added `id` prop). Made `id` prop required and removed fallback to eliminate the risk entirely.
- **Decision**: FIXED
