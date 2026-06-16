<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Notification Toggles

- **Plan**: context/changes/notification-toggles/plan.md
- **Scope**: All Phases (1–4)
- **Date**: 2026-06-16
- **Verdict**: APPROVED (all findings resolved in triage)
- **Findings**: 0 critical, 4 warnings, 3 observations

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

### F1 — getInitialEnabled defaults to opt-in without explicit consent

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Data Safety
- **Location**: frontend/src/hooks/useNotifications.ts (getInitialEnabled)
- **Detail**: `localStorage.getItem(BROWSER_NOTIF_KEY) !== "0"` silently opts in users who granted permission but never touched the toggle (`null !== "0"` is true).
- **Fix**: Changed to `localStorage.getItem(BROWSER_NOTIF_KEY) === "1"` for explicit opt-in.
- **Decision**: FIXED

### F2 — Stale closure in notifyDueToday when called right after requestPermission

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Reliability
- **Location**: frontend/src/hooks/useNotifications.ts:68
- **Detail**: `notifyDueToday` closed over React state `isEnabled`, which is stale immediately after `requestPermission` resolves. Latent footgun for future callers chaining the two calls.
- **Fix**: Replaced `if (!isEnabled) return` with `if (localStorage.getItem(BROWSER_NOTIF_KEY) !== "1") return` — synchronous and stale-closure-free.
- **Decision**: FIXED

### F3 — Unplanned notifyDueToday call added to login/page.tsx

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: frontend/src/app/login/page.tsx
- **Detail**: `void notifyDueToday()` added after login() — not in the original plan. Low risk (guarded by localStorage check), but undocumented scope.
- **Fix**: Added plan addendum in plan.md documenting the login-time call site.
- **Decision**: FIXED

### F4 — NotificationToggle.tsx is orphaned dead code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/NotificationToggle.tsx
- **Detail**: No importers remaining after dashboard nav refactor. Still had `notifyDueToday()` on mount — would double-fire if accidentally re-imported.
- **Fix**: Deleted frontend/src/components/NotificationToggle.tsx. Translation keys retained (still consumed by useNotifications.ts).
- **Decision**: FIXED

### F5 — Switch.tsx cursor stays pointer when disabled

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/ui/Switch.tsx (label element)
- **Detail**: `cursor-pointer` was unconditional; `disabled` prop had no cursor effect.
- **Fix**: Added conditional `cursor-not-allowed` on label and `peer-disabled:opacity-50` on thumb.
- **Decision**: FIXED

### F6 — requestFailed i18n key defined but never consumed

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/messages/en.json, pl.json, de.json (SettingsPage.browserNotifications.requestFailed)
- **Detail**: Key present in all three locales, but BrowserNotificationsTile never catches errors from requestPermission() or renders this string.
- **Fix**: Removed the key from all three message files.
- **Decision**: FIXED

### F7 — Checkbox React keys use translated strings

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/app/dashboard/settings/page.tsx (checkboxes map)
- **Detail**: Translated label strings as React keys cause unnecessary remounts on locale switch.
- **Fix**: Changed tuple to `[key, checked, setter, label]` with stable keys `"2-before"`, `"1-before"`, `"on-day"`, `"1-after"`.
- **Decision**: FIXED
