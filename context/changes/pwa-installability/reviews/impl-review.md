<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: PWA Installability

- **Plan**: `context/changes/pwa-installability/plan.md`
- **Scope**: All phases (Phase 1 + Phase 2)
- **Date**: 2026-06-15
- **Verdict**: NEEDS ATTENTION → all findings fixed during triage
- **Findings**: 1 critical · 2 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL → FIXED |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — proxy.ts PNG exclusion is over-broad

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `frontend/src/proxy.ts:27`
- **Detail**: `.*\\.png$` bypasses auth for ANY URL ending in .png, not just the two icon files. In the current codebase no page routes end in .png so not exploitable, but structurally unsound.
- **Fix**: Tightened to `icon-(?:192|512)\\.png$` to match exactly the two known icon files.
- **Decision**: FIXED

### F2 — Unplanned proxy.ts change not documented in plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `frontend/src/proxy.ts`
- **Detail**: proxy.ts was modified (unplanned discovery — Next.js 16 treats proxy.ts as a route-level auth guard via `PROXY_FILENAME = 'proxy'` constant) but not reflected in the plan's Key Discoveries.
- **Fix**: Added a Key Discoveries bullet to plan.md documenting the proxy.ts convention.
- **Decision**: FIXED

### F3 — SW registration errors silently swallowed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `frontend/src/components/pwa-register.tsx:12`
- **Detail**: `.catch(() => {})` swallows all errors — HTTPS misconfiguration, CSP, wrong scope all fail silently with no diagnostic path.
- **Fix**: Added dev-mode `console.warn("SW registration failed:", err)` — silent in production.
- **Decision**: FIXED

### F4 — sw.js has no comment explaining intentional no-caching

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: `frontend/public/sw.js`
- **Detail**: Bare fetch passthrough looks unfinished to a future developer.
- **Fix**: Added comment: `// Intentional passthrough — installability only, no offline caching (FR-013)`
- **Decision**: FIXED
