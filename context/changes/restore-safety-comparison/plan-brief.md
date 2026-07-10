# Restore Safety Comparison — Plan Brief

> Full plan: `context/changes/restore-safety-comparison/plan.md`

## What & Why

Before a user confirms restoring a backup — a destructive operation that wipes and replaces all current bill/payment data — show them a comparison of current data vs. the backup file (bill/payment counts + backup export date), with a warning if the backup would reduce their data. This closes the gap identified in a codebase audit: the existing confirmation dialog prevents accidental clicks, but can't warn about restoring a *stale* file, since it never compares content.

## Starting Point

`POST /export/restore` already validates JSON/schema/size and does a full destructive replace scoped to the user; `RestoreButton.tsx` already has a custom confirmation dialog (not a bare `window.confirm()`) with a 10MB client-side size check before showing it. What's missing is any signal about *what* is in the backup relative to what exists today.

## Desired End State

Picking a backup file shows, before the user can click "Replace My Data": current bill/payment counts, the backup's own counts and export date, and a warning line if the backup has fewer bills or payments. Picking a non-JSON or malformed file shows an inline error immediately and never opens the dialog.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Current-count data source | New `GET /export/summary` endpoint (counts only) | Avoids pulling full backup data just to count it; cleaner separation of concerns | Plan (brainstorm) |
| Count scoping | Match `/export/json` exactly — exclude `is_deleted` | Backups never contain soft-deleted rows, so any other scoping makes the comparison meaningless | Plan |
| Bad-file timing | Block immediately on file selection (client-side JSON parse) | Mirrors the existing 10MB size-check pattern; never reaches the confirm step | Plan (brainstorm) |
| Missing export date | Show "export date unknown" for schema_version 2 backups | Graceful fallback rather than blocking older backup formats | Plan (brainstorm) |
| Stale-data warning | Visual warning when backup counts < current counts | Directly targets the audit's identified failure mode | Plan (brainstorm) |
| Warning copy tone | Direct/plain, matching existing dialog voice | Consistent with the app's existing terse, high-stakes phrasing | Plan |
| Backend test depth | Dedicated pytest for counts + user scoping | Matches this codebase's established pattern (`test_user_scoping.py`) for any user-owned-data endpoint | Plan |
| E2E test depth | Both stale-warning and malformed-file scenarios | Covers both failure modes this feature exists to catch | Plan |

## Scope

**In scope:**
- New `GET /export/summary` backend endpoint + schema + pytest
- `RestoreButton.tsx` client-side file validation, count comparison, warning display
- New i18n keys across `en.json`/`pl.json`/`de.json`
- Two new e2e scenarios extending `06-export-restore.spec.ts`

**Out of scope:**
- Changing `POST /export/restore`'s destructive replace semantics (no merge/dry-run/undo) — that's `restore-auto-backup-safety-net` (S-19), a separate sibling change
- Fixing `restoreFromBackup`'s bypass of `apiFetch`/401 auto-logout handling — known, unrelated issue

## Architecture / Approach

Read-only backend endpoint (no schema/model changes, no migration) feeds a frontend comparison computed from two sources: the new endpoint (current state) and client-side `JSON.parse` of the picked file (backup state, already in the browser — no extra round trip needed to inspect it). The comparison slots into the existing dialog's `confirming` state without restructuring the state machine.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend summary endpoint | `GET /export/summary` + test coverage | Must match `/export/json`'s `is_deleted` exclusion exactly, or the warning logic breaks |
| 2. Frontend comparison dialog | Comparison + warning in the existing dialog, new i18n strings | Locale files must stay valid JSON across all three languages |
| 3. E2E coverage | Two new Playwright scenarios | None significant — additive to an existing, working spec file |

**Prerequisites:** None beyond the existing `restore-safety-comparison` design (already brainstormed and agreed).
**Estimated effort:** Small — 1 session across 3 phases; no schema changes, no new infrastructure.

## Open Risks & Assumptions

- Assumes `getExportSummary()` failing (network error) shouldn't block the restore flow — dialog degrades to showing backup-only info rather than hard-failing. If this assumption is wrong (e.g. you'd rather block on summary failure), Phase 2 needs revisiting.

## Success Criteria (Summary)

- A user restoring a backup with less data than they currently have sees a clear warning before confirming.
- A user picking a corrupted or non-backup file gets immediate feedback, never reaching the destructive-action dialog.
- No change to restore's actual behavior for a valid, non-stale backup — the happy path is unaffected.
