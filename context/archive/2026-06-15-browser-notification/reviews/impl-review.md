<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Browser Notifications for Bill Due Dates

- **Plan**: context/changes/browser-notification/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-15
- **Verdict**: NEEDS ATTENTION → resolved via triage
- **Findings**: 2 critical · 5 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | FAIL |

## Findings

### F1 — NotificationToggle.tsx not committed — build broken in repo

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: frontend/src/components/NotificationToggle.tsx
- **Detail**: Commit 7de1f8e included layout.tsx with the NotificationToggle import but NotificationToggle.tsx itself was never staged. Confirmed: stashing the file causes `npm run build` to fail.
- **Fix**: `git add frontend/src/components/NotificationToggle.tsx` and commit.
- **Decision**: MANUAL — user will commit this file manually.

### F2 — serviceWorker.ready rejection is unhandled

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/hooks/useNotifications.ts:48
- **Detail**: `await navigator.serviceWorker.ready` sat outside any try/catch. If the SW fails to activate, notifyDueToday threw an unhandled promise rejection.
- **Fix**: Wrapped `const reg = await navigator.serviceWorker.ready` in its own try/catch that returns early on failure.
- **Decision**: FIXED

### F3 — SSR hydration: permission initialises as "denied" on server

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/hooks/useNotifications.ts:10–13, 20
- **Detail**: getPermission() returned "denied" on the server (no window). React used this as the hydration baseline — a user who already granted permission saw BellOff on first render.
- **Fix**: Changed getPermission() to return "default" when window is undefined; added suppressHydrationWarning to buttons (F9 fixed together).
- **Decision**: FIXED

### F4 — useTranslations inside data hook couples it to next-intl Provider

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture / Plan Adherence
- **Location**: frontend/src/hooks/useNotifications.ts:4, 21
- **Detail**: useTranslations in a data hook silently requires a next-intl Provider ancestor; breaks hook reuse outside Provider tree.
- **Fix**: Added comment documenting the Provider requirement; accepted as intentional for now.
- **Decision**: FIXED (comment added)

### F5 — Two NotificationToggle mounts fire duplicate API call on mobile

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: frontend/src/app/dashboard/layout.tsx:89, 139
- **Detail**: NotificationToggle rendered inside `{menuOpen && ...}` caused a second mount + fetchPayments call each time the mobile menu was opened.
- **Fix**: Moved the mobile instance out of the conditional dropdown into the always-mounted mobile toolbar row (next to LanguageToggle). Removed from the dropdown utility row.
- **Decision**: FIXED

### F6 — localStorage.setItem not guarded against quota exceptions

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/hooks/useNotifications.ts:58
- **Detail**: localStorage.setItem throws DOMException on quota exceeded; keys accumulated indefinitely.
- **Fix**: Wrapped setItem in try/catch; added pruning of past-date keys on each notifyDueToday run.
- **Decision**: FIXED

### F7 — Empty useEffect dep array with unmemoized notifyDueToday

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/NotificationToggle.tsx:12–14
- **Detail**: eslint-disable silently suppressed the exhaustive-deps warning with no explanation.
- **Fix**: Added explanatory comment inside the effect body documenting why [] is intentional (fire-and-forget on mount).
- **Decision**: FIXED

### F8 — UTC "today" fails near midnight for UTC+2 users

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/hooks/useNotifications.ts:33
- **Detail**: toISOString() is UTC — a payment due "today" in local time could be missed between midnight and 2am in UTC+2.
- **Fix**: Replaced with `new Date().toLocaleDateString("en-CA")` for local-timezone YYYY-MM-DD.
- **Decision**: FIXED

### F9 — Missing suppressHydrationWarning on NotificationToggle buttons

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/NotificationToggle.tsx:24, 34
- **Detail**: Rendered output differs between server and client (permission-dependent icon and aria-label); React may warn about hydration mismatch.
- **Fix**: Fixed as part of F3 — suppressHydrationWarning added to both button elements.
- **Decision**: FIXED (with F3)

### F10 — requireInteraction:true stacks persistent banners for multiple bills

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/hooks/useNotifications.ts:62
- **Detail**: Every notification persists until manually dismissed; multiple due bills stack up banners.
- **Decision**: SKIPPED — user explicitly requested this behaviour to prevent notifications disappearing too quickly.
