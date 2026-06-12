<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth UI

- **Plan**: `context/changes/auth-ui/plan.md`
- **Scope**: All phases (3 of 3)
- **Date**: 2026-06-12
- **Verdict**: APPROVED (after triage fixes)
- **Findings**: 0 critical  4 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (fixed) |
| Architecture | PASS |
| Pattern Consistency | PASS (fixed) |
| Success Criteria | PASS |

## Findings

### F1 — JWT cookie value truncated when token contains "="

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/auth.ts:8
- **Detail**: `match.split("=")[1]` discards everything after the first `=`. JWT base64url usually omits padding, but if the token ever includes `=` the read value is truncated, causing silent 401s.
- **Fix**: Use `indexOf` + `slice` instead of `split`.
- **Decision**: FIXED — replaced `split("=")[1]` with `indexOf("=")` + `slice(idx + 1)`.

### F2 — API base URL hardcoded to localhost

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/api.ts:3
- **Detail**: `BASE_URL = "http://localhost:8010"` breaks non-local environments and any future server-side fetch.
- **Fix A ⭐ Recommended**: `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010"` with `.env.example` entry.
- **Decision**: FIXED via Fix A — env var with localhost fallback; `NEXT_PUBLIC_API_URL` added to `.env.example`.

### F3 — Double-submit window in register form

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/app/register/page.tsx:31
- **Detail**: `setLoading(true)` placed after early-return password validation, inconsistent with login page and leaving a double-submit window.
- **Fix**: Move `setLoading(true)` before validation, add `setLoading(false)` on early return.
- **Decision**: FIXED — moved to match login page pattern.

### F4 — proxy.ts public-route check uses startsWith

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/proxy.ts:10-12
- **Detail**: `pathname.startsWith(route)` makes future routes like `/login-history` silently public.
- **Fix**: Exact-or-subpath match: `pathname === route || pathname.startsWith(route + "/")`.
- **Decision**: FIXED.

### F5 — TokenResponse interface duplicated in login and register pages

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/app/login/page.tsx:9, frontend/src/app/register/page.tsx:9
- **Detail**: Identical interface defined in both files; single-change-point risk.
- **Fix**: Export from `src/lib/api.ts`, import with `type` in both pages.
- **Decision**: FIXED — `TokenResponse` exported from api.ts; both pages use `import { type TokenResponse }`.

### F6 — res.json() on empty success body will throw

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/api.ts:22
- **Detail**: `res.json()` throws SyntaxError on 2xx with empty body (e.g. future 204 DELETE).
- **Fix**: `res.text()` + conditional `JSON.parse`.
- **Decision**: FIXED — using `text ? JSON.parse(text) : undefined` pattern.

### F7 — isAuthenticated not re-synced if cookie expires mid-session

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/context/auth-context.tsx:22
- **Detail**: Cookie read once on mount; in-page state stays true if cookie cleared externally. Proxy catches it at next navigation — not a security bypass, just stale UI.
- **Fix**: Acceptable trade-off for non-HttpOnly cookie design.
- **Decision**: SKIPPED — accepted trade-off.
