<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Language Support

- **Plan**: context/changes/language-support/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — No server-side whitelist on language_preference

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/schemas/auth.py:29
- **Detail**: `UserProfileUpdate.language_preference` was typed as `str | None`, accepting any string. An attacker could store arbitrary data in this column.
- **Fix**: Use `Literal["en", "pl", "de"] | None` so Pydantic rejects unknown locales at the boundary.
- **Decision**: FIXED — changed to `Literal["en", "pl", "de"] | None`

### F2 — Unsafe locale cast in LocaleProvider

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/context/locale-context.tsx:50–56
- **Detail**: `profile.language_preference as Locale` cast executed before checking whether the value is actually in the known locale set. A backend returning an unexpected value would silently corrupt locale state.
- **Fix**: Add `VALID_LOCALES.includes(profile.language_preference as Locale)` guard before the cast.
- **Decision**: FIXED — added `VALID_LOCALES` constant and guard condition

### F3 — No AbortController on fetchMe — post-logout setState risk

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: frontend/src/context/locale-context.tsx:47–61
- **Detail**: If the user logs out while fetchMe() is in-flight, the .then callback still fires and calls setLocaleState on a component that may have already reset auth state.
- **Fix A ⭐ Recommended**: Add cancelled flag (same pattern as BillsPage/ArchivedBillsPage useEffects).
- **Decision**: FIXED via Fix A — cancelled flag pattern applied

### F4 — `"de"` missing from UserProfile.language_preference union

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: frontend/src/lib/user-api.ts:5
- **Detail**: German was added in Phase 4 but `UserProfile.language_preference` type union remained `"en" | "pl" | null`, causing a type gap for the `"de"` value returned from the backend.
- **Fix**: Add `"de"` to the union: `language_preference: "en" | "pl" | "de" | null`.
- **Decision**: FIXED

### F5 — api.ts plain-object detail stringifies as [object Object]

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/api.ts
- **Detail**: Phase 4 fix added array-unwrapping for FastAPI 422 errors. Non-standard backend errors with nested objects without a `msg` field could still produce [object Object] in edge cases.
- **Decision**: RESOLVED — Phase 4 fix covers the primary 422 case; remaining edge risk accepted

### F6 — Migration bundles two unrelated schema changes

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: backend/alembic/versions/632d778e4aa5_add_language_preference_to_users.py
- **Detail**: Migration bundles bill_templates.currency backfill (from prior no-op migration e3eb40b9157b) and users.language_preference. The bundle was unavoidable because the previous migration was a no-op and autogenerate picked up both diffs.
- **Decision**: ACCEPTED as-is — migration is correct and already applied; splitting would require rolling back prod DB

### F7 — Amount regex accepts leading zeros

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/components/bills/BillTemplateForm.tsx:75
- **Detail**: Regex `/^\d+(\.\d+)?$/` accepts `007`, `0123`, etc. No data corruption (Number("007") === 7) but allows visually misleading input.
- **Fix**: Change to `/^(0|[1-9]\d*)(\.\d+)?$/`.
- **Decision**: FIXED
