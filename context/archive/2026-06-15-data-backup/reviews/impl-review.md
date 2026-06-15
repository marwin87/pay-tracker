<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Data Backup Implementation Plan

- **Plan**: context/changes/data-backup/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2)
- **Date**: 2026-06-15
- **Verdict**: NEEDS ATTENTION (resolved via triage)
- **Findings**: 1 critical · 4 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — password_hash exported for all users in backup file

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py:100
- **Detail**: Plan specified exporting password_hash for all users. Bcrypt hashes in a user-downloadable file enable offline brute-force attacks against all accounts. Deeper issue: backup was dumping all users, not just the authenticated user's own data.
- **Fix Applied**: Scoped users export to authenticated user only (`me: User = Depends(current_user)`). User backs up their own account (including own hash for restore); other users' credentials are never exposed.
- **Decision**: FIXED

### F2 — Unbounded full-table queries on all three tables

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py:91–93
- **Detail**: db.query(BillTemplate/PaymentInstance).all() with no LIMIT. Consistent with full-backup intent but undocumented.
- **Fix Applied**: Added comment documenting intentional full-history, no-filter design.
- **Decision**: FIXED

### F3 — Generic error message discards HTTP status

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/export-api.ts:12–13
- **Detail**: `throw new Error("Backup failed")` discards HTTP status — 401 and 500 look identical to the user.
- **Fix Applied**: `throw new Error(\`Backup failed: ${res.status}\`)`
- **Decision**: FIXED

### F4 — Escape key unreliable: no autoFocus on dialog open

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/BackupButton.tsx:63
- **Detail**: onKeyDown Escape handler on a non-focusable div only fires if a child button has focus. Dialog opened without focus → Escape doesn't work.
- **Fix Applied**: Added `autoFocus` to the Cancel button, matching ArchiveConfirmDialog pattern.
- **Decision**: FIXED

### F5 — No date-range filter on JSON export vs. year-scoped xlsx

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py:93
- **Detail**: xlsx scoped by year; JSON exports all PaymentInstance rows ever. Intentional asymmetry but undocumented.
- **Decision**: FIXED (covered by F2 comment)

### F6 — createPortal vs. inline render inconsistency with ArchiveConfirmDialog

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/components/BackupButton.tsx:36
- **Detail**: BackupButton uses createPortal; ArchiveConfirmDialog renders inline. Portal approach is more robust (proven by stacking context fix during implementation).
- **Decision**: SKIPPED — no action needed; portal approach is preferred going forward

### F7 — Synchronous revokeObjectURL after click() — minor race

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: frontend/src/lib/export-api.ts:22
- **Detail**: URL.revokeObjectURL called synchronously after a.click(). Pre-existing pattern in downloadXlsx.
- **Decision**: SKIPPED — works in all major browsers in practice
