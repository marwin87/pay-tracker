# Restore Auto Backup Safety Net — Plan Brief

> Full plan: `context/changes/restore-auto-backup-safety-net/plan.md`

## What & Why

Before a destructive restore wipes a user's data, automatically save a snapshot of it server-side, so a mistaken restore can be undone — even if the user proceeds past the sibling `restore-safety-comparison` warning, or the request bypasses the UI entirely. This is the "catch it after the fact" half of the restore-safety pair; S-18 is "prevent the mistake in the UI."

## Starting Point

`POST /export/restore` already does a full destructive wipe-and-replace, atomically, inside one DB transaction. There is no snapshot, no undo, and no persistent storage in this deployment beyond Postgres (no object storage, no volume on the backend container) — so the storage question that was open going into planning is now settled by infrastructure: a new Postgres table is the only viable option.

## Desired End State

Every restore (when there's existing data to lose) saves a snapshot. A dashboard banner appears whenever an active snapshot exists, showing how long ago it was taken, with a "Restore Previous Data" button. Confirming reverts the wipe. A daily job cleans up snapshots older than a configurable retention window (default 7 days).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Snapshot storage | New Postgres table | Only durable option — no object storage, no backend volume in this deployment |
| Recovery path | Self-serve dashboard banner | A snapshot with no usable recovery path is pointless for a self-hosted app with no support team |
| Snapshot count per user | Single latest only | Matches the "undo my last mistake" use case; keeps UI to one button, no picker |
| Retention | Configurable via `.env`, default 7 days | Matches this app's existing pattern (e.g. password-reset token expiry) |
| Snapshot-write failure | Abort the restore entirely | The whole point of this feature is guaranteeing recoverability — never restore with a silently-missing safety net |
| Empty-data case | Skip snapshot when nothing to lose | An empty snapshot has no recovery value |
| Banner placement/trigger | Dashboard-wide, shown whenever an active snapshot exists (not tied to post-restore session state) | Survives the restore flow's full-page reload and correctly reappears in a later session within the retention window |

## Scope

**In scope:** New `RestoreSnapshot` table + migration + retention config; snapshot-write integrated into the existing restore transaction; cleanup job; recovery status + restore-from-snapshot endpoints; dashboard banner + confirmation dialog; e2e coverage.

**Out of scope:** Multiple snapshots/history picker; re-snapshotting before an undo (no "redo"); operator/admin-only recovery tooling; any change to S-18's confirmation-dialog behavior; object storage or backend disk volumes.

## Architecture / Approach

The snapshot write rides inside the existing restore transaction (same DB session, single commit) — this makes atomicity and fail-safe abort "free": if the snapshot insert fails, the function never reaches the destructive deletes, and nothing commits. A single-row-per-user unique constraint keeps the table bounded without needing count-based retention logic. The recovery banner checks snapshot existence via API on every dashboard mount rather than relying on component state, so it works correctly across the restore flow's page reload and across browser sessions.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model & config | `RestoreSnapshot` table, migration, retention setting | Migration must be verified, not blindly trusted (per project lessons) |
| 2. Snapshot-on-restore + cleanup | Snapshot write wired into `restore_json`; scheduled cleanup job | Must not disturb the existing restore transaction's atomicity |
| 3. Recovery API | Status + restore-from-snapshot endpoints | Must correctly filter out expired-but-not-yet-cleaned-up snapshots |
| 4. Frontend banner | Dashboard banner + confirm dialog + i18n | Must survive the restore flow's full page reload |
| 5. E2E coverage | Full recovery flow + no-snapshot case | None significant |

**Prerequisites:** None beyond `restore-safety-comparison` (S-18) having already shipped — this change is independent and additive, not blocked by it.
**Estimated effort:** Medium — 5 phases, roughly 1-2 sessions.

## Open Risks & Assumptions

- Assumes a daily cleanup cadence is sufficient given day-granularity retention; if retention is ever set to sub-day values for testing, the cleanup job's cadence would need revisiting (not expected in production use).

## Success Criteria (Summary)

- A user who restores the wrong backup can recover their prior data via a dashboard banner, without needing a second, separately-held backup file.
- The safety net degrades safely: if it can't be created, the destructive restore itself is blocked rather than proceeding silently unprotected.
- The snapshot table never grows unbounded — one row per user, cleaned up on a retention schedule.
