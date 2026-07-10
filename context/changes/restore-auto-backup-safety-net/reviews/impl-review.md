<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Restore Auto Backup Safety Net

- **Plan**: context/changes/restore-auto-backup-safety-net/plan.md
- **Scope**: Full plan (Phases 1-5)
- **Date**: 2026-07-10
- **Verdict**: NEEDS ATTENTION (all findings fixed during triage — see Decisions below)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Context notes (not findings)

- Phase 4 was deliberately pivoted mid-implementation per direct user feedback: global dismissible banner → persistent Settings > Restore subsection, relative time → absolute date/time, no dismiss functionality. Documented in Progress row 4.6. Verified faithful to the adapted intent.
- Phase 5's E2E work surfaced a real bug (missing `ON DELETE CASCADE` on `restore_snapshots.user_id`), fixed in place in the (still-unshipped) Phase 1 migration + model. Verified clean — only one migration file exists, model and migration agree.
- Per-user scoping verified correct on both new endpoints (`GET /export/last-snapshot`, `POST /export/restore-snapshot`).
- All automated checks re-run clean: 207 backend tests, mypy, black, frontend lint, 12/12 E2E, all 3 locale files valid JSON.

## Findings

### F1 — POST /restore-snapshot ignores the retention window that GET /last-snapshot enforces

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/export.py:342-344
- **Detail**: `GET /export/last-snapshot` (line 329) filters `created_at >= cutoff` so an expired snapshot reports 404. `POST /export/restore-snapshot` (line 343) queries by `user_id` alone with no cutoff check — between the daily cleanup cron and the actual retention deadline, a snapshot already reported as expired via GET can still be restored via POST. `test_last_snapshot_404_when_past_retention_window` only covers GET; no equivalent POST test exists.
- **Fix**: Add the same `RestoreSnapshot.created_at >= cutoff` filter to the query in `restore_from_snapshot`, ideally via one shared helper both endpoints call. Add a test mirroring `test_last_snapshot_404_when_past_retention_window` for the POST endpoint.
- **Decision**: FIXED — factored a shared `_active_snapshot(db, user_id)` helper used by both `/last-snapshot` and `/restore-snapshot`; added `test_restore_from_snapshot_404_when_past_retention_window`. 208 backend tests pass.

### F2 — Plan's atomicity rationale is misleading

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: backend/app/routers/export.py (restore_json, around the db.commit() call)
- **Detail**: The plan claims "abort restore on snapshot-write failure" comes from "ordering alone." Verified: the actual safety comes from snapshot insert + delete + re-insert all sharing one Session with a single `db.commit()` at the end — atomic because it's one transaction, not because of ordering per se. A future intermediate `db.commit()` (e.g. to reduce lock time) would silently break this with no code signal.
- **Fix**: Add a short comment near the `db.commit()` call in `restore_json` stating the invariant explicitly (single commit — do not split; snapshot/delete/insert must land or roll back together).
- **Decision**: FIXED — added the invariant comment directly above `db.commit()` in `restore_json`.

### F3 — Locale namespace name lags the component rename

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/messages/{en,pl,de}.json, frontend/src/components/SnapshotRecoverySection.tsx
- **Detail**: Component renamed from `SnapshotRecoveryBanner` to `SnapshotRecoverySection` mid-implementation (Settings-only pivot), but all three locale files still key its strings under `"SnapshotRecoveryBanner"`. Harmless today; a future search for "Section"-named locale keys won't find them.
- **Fix**: Rename the namespace to `SnapshotRecoverySection` across all three locale files and the `useTranslations(...)` call site.
- **Decision**: FIXED — renamed the namespace in en/pl/de and the `useTranslations()` call site. Lint, JSON validity, and full E2E suite (12/12) re-verified green.
