# Restore Auto Backup Safety Net Implementation Plan

## Overview

Add a server-side safety net around the destructive `POST /export/restore` flow: immediately before a restore wipes a user's `BillTemplate`/`PaymentInstance` data, save a snapshot of that data to a new table. A configurable-retention cleanup job removes stale snapshots, and a self-serve "restore previous data" banner on the dashboard lets the user undo a mistaken restore. This is the complementary safety net to the sibling `restore-safety-comparison` (S-18) change: S-18 helps the user avoid the mistake in the UI; this change recovers from it after the fact, regardless of entry point (UI or direct API call).

## Current State Analysis

- `POST /export/restore` (`backend/app/routers/export.py:197-262`, handler `restore_json`) validates the uploaded JSON, then destructively deletes the user's existing `PaymentInstance`/`BillTemplate` rows (lines 236-243) and inserts the backup's contents, all inside one `db` session committed once at the end (line 257's `db.commit()`). No snapshot of the pre-delete state exists today.
- **Insertion point**: the snapshot must be taken between the orphaned-instance validation (ends `export.py:207`) and the `existing_ids = [...]` query that precedes the destructive deletes (`export.py:209-219`). At that point `me.id` is available and the existing rows are still intact.
- **Storage decision (settled by infrastructure, not preference)**: this deployment has no object storage (S3/MinIO) and the `backend` service in `docker-compose.yml`/`docker-compose.prod.yml` has no persistent volume — its filesystem is fully ephemeral. Postgres is the only durable store available. A new table is therefore the only viable snapshot storage.
- **Scheduler pattern**: `backend/app/main.py:18-30` wires a `BackgroundScheduler` (sync, not async) into the FastAPI `lifespan` context manager, registering `send_daily_reminders` as a cron job (`scheduler.add_job(send_daily_reminders, "cron", minute="0,30", args=[SessionLocal])`) and calling `scheduler.shutdown(wait=False)` on app shutdown. A new cleanup job follows this exact registration shape.
- **Job function pattern**: `backend/app/services/reminder_job.py`'s job functions take the `sessionmaker` itself (not a `Session`) as a parameter, open their own session, and always `db.close()` in a `finally` block (e.g. `send_daily_reminders(SessionLocal: sessionmaker, ...)`, `reminder_job.py:207-267`).
- **Model style**: SQLAlchemy 2.0 `Mapped[T]`/`mapped_column()` throughout `backend/app/models/bill.py` (e.g. `PaymentInstance`, lines 85-128) — `from __future__ import annotations`, `Mapped[int] = mapped_column(primary_key=True)`, `ForeignKey(...)`, timezone-aware `DateTime` with `default=lambda: datetime.now(timezone.utc)`. Per `AGENTS.md`'s hard rule, the new model must follow this exactly — no legacy `Column()` style.
- **Config style**: `backend/app/core/config.py`'s `Settings(BaseSettings)` class (lines 10-63) holds all tunables as typed fields with sane defaults (e.g. `password_reset_token_expire_minutes: int = 60`), loaded from `.env` via `pydantic-settings`. A new `restore_snapshot_retention_days: int = 7` field follows this pattern exactly.
- **Migration practice**: per `context/foundation/lessons.md`, autogenerate output must always be read and verified before running `upgrade head`; for this change (a straightforward new-table addition, no renames), autogenerate is expected to work cleanly, but the generated file must still be inspected.

### Key Discoveries:

- The existing `restore_json` transaction is already atomic (one `db.commit()` at the end) — adding the snapshot write to the *same session*, before the destructive deletes, makes the snapshot naturally atomic with the restore and naturally fail-safe: if the snapshot insert raises, the function exits before reaching the delete lines and nothing commits. No extra try/except scaffolding is needed to satisfy "abort restore on snapshot-write failure."
- "Single latest snapshot per user" means the table needs a `UNIQUE` constraint on `user_id`, with the snapshot-write step deleting any prior row for that user before inserting the new one (upsert-by-replace, not a true SQL upsert, to keep the ORM code simple and consistent with the codebase's existing query style).
- The dashboard banner must not rely on ephemeral component state carried across the restore's `window.location.reload()` — it must instead query "does an active snapshot exist" on every dashboard mount, which also correctly handles a user returning in a later browser session within the retention window.

## Desired End State

- Every successful `POST /export/restore` first captures the user's pre-restore data into a `RestoreSnapshot` row (overwriting any prior snapshot for that user), unless the user had no existing bill templates (nothing to lose).
- If the snapshot write fails for any reason, the restore itself does not proceed (the whole operation aborts, no partial state).
- A daily scheduled job deletes snapshot rows older than `RESTORE_SNAPSHOT_RETENTION_DAYS` (env-configurable, default 7).
- Visiting the dashboard while an active (unexpired) snapshot exists shows a dismissible banner: "Previous data saved — restore it?" with a relative timestamp and a "Restore Previous Data" button. Confirming it wipes current data, re-inserts the snapshot's payload, and deletes the consumed snapshot row.
- Dismissing the banner hides it until a *new* snapshot is created (tracked by snapshot timestamp in `localStorage`).

**Verification:** `docker compose up --build`, register a user, create 2+ bills, export a backup, restore a *different* (or the same) backup file — dashboard now shows the recovery banner. Click "Restore Previous Data" — original data returns, banner disappears. Restore again with no existing bills (fresh user) — no snapshot row is created, no banner appears.

## What We're NOT Doing

- Not keeping more than one snapshot per user (no history/multiple-restore-point picker) — single latest snapshot only, per the confirmed decision.
- Not snapshotting the "mistaken" state again before an undo (restore-from-snapshot) executes — undo is a one-shot action; if the user wants to "redo," they'd need their own separately-exported backup file. This keeps the feature bounded and avoids recursive snapshot chains.
- Not building any operator/admin-only recovery tooling — the self-serve dashboard banner is the only recovery path.
- Not changing `POST /export/restore`'s existing validation or `restore-safety-comparison`'s (S-18) confirmation-dialog behavior — this change only adds the snapshot step and a new recovery surface.
- Not adding object storage or a backend disk volume — the snapshot lives exclusively in Postgres, per the settled infrastructure constraint.

## Implementation Approach

Five phases, ordered so each ships working, independently verifiable code: data model first (nothing depends on it existing yet), then the snapshot-write + cleanup logic (backend-only, testable via pytest), then the recovery API (backend-only, testable via pytest), then the frontend banner (consumes the now-stable API), then e2e coverage across the full flow.

## Phase 1: Data model, migration, and config

### Overview

Add the `RestoreSnapshot` table and the retention-period setting.

### Changes Required:

#### 1. Model

**File**: `backend/app/models/bill.py` (or a new `backend/app/models/restore_snapshot.py` — implementer's choice; a new file is preferred since this model is conceptually distinct from the bill/payment domain models, matching how `reset_token.py` got its own file rather than living in `bill.py`)

**Intent**: New SQLAlchemy 2.0 model storing one snapshot row per user, holding the full pre-restore payload.

**Contract**: `RestoreSnapshot` with `id: Mapped[int]` (PK), `user_id: Mapped[int]` (`ForeignKey("users.id")`, `unique=True`, `nullable=False` — enforces "single latest snapshot per user" at the DB level), `payload: Mapped[dict]` (SQLAlchemy `JSON` column type, storing the same `bill_templates`/`payment_instances` array shape that `GET /export/json` produces), `created_at: Mapped[datetime]` (timezone-aware, `default=lambda: datetime.now(timezone.utc)`, used both for the recovery banner's relative-time display and the cleanup job's retention comparison).

#### 2. Config

**File**: `backend/app/core/config.py`

**Intent**: Add the env-configurable retention period, following the exact pattern of `password_reset_token_expire_minutes`.

**Contract**: `restore_snapshot_retention_days: int = 7` field on `Settings`.

#### 3. `.env.example`

**File**: `.env.example`

**Intent**: Document the new setting alongside the existing documented settings.

**Contract**: Add `RESTORE_SNAPSHOT_RETENTION_DAYS=7` with a one-line comment matching the style of the existing entries.

#### 4. Migration

**File**: new Alembic revision under `backend/alembic/versions/`

**Intent**: Create the `restore_snapshots` table via `docker compose exec backend uv run alembic revision --autogenerate -m "add restore_snapshots table"`.

**Contract**: Standard Alembic revision; per `lessons.md`, read the generated file before running `upgrade head` to confirm it captures the table, the `user_id` FK, and the unique constraint correctly.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `docker compose exec backend uv run alembic upgrade head`
- [ ] mypy passes: `cd backend && uv run mypy app`
- [ ] black formatting passes: `cd backend && uv run black --check --target-version py313 .`

#### Manual Verification:

- [ ] `\d restore_snapshots` in psql shows the expected columns, the FK to `users`, and the unique constraint on `user_id`

---

## Phase 2: Snapshot-on-restore + cleanup job

### Overview

Wire the snapshot write into `restore_json`, and add the scheduled cleanup job.

### Changes Required:

#### 1. Snapshot-on-restore logic

**File**: `backend/app/routers/export.py`

**Intent**: Between the orphaned-instance check and the destructive-delete block in `restore_json`, build the pre-delete payload (same shape as `export_json`'s `bill_templates`/`payment_instances` serialization, scoped to `me.id`), delete any existing `RestoreSnapshot` row for `me.id`, and insert the new one — all via `db.add()`/`db.query().delete()` on the *same session* used for the rest of the restore, so it commits atomically with (or aborts atomically alongside) the restore itself. Skip this entirely when the user has no existing `BillTemplate` rows (nothing to snapshot).

**Contract**: No new transaction/session boundary — reuses the existing `db` session and the single `db.commit()` at the end of `restore_json`. If the snapshot insert raises, the function exits before the destructive deletes execute and nothing commits — this is the "abort restore, fail-safe" behavior, achieved by ordering alone, not new error-handling code.

#### 2. Cleanup job

**File**: new `backend/app/services/snapshot_cleanup.py`

**Intent**: A scheduled job function following `reminder_job.py`'s exact shape (takes `SessionLocal: sessionmaker`, opens its own session, `finally: db.close()`) that deletes `RestoreSnapshot` rows older than `settings.restore_snapshot_retention_days`.

**Contract**: `cleanup_old_snapshots(SessionLocal: sessionmaker) -> None`.

#### 3. Scheduler registration

**File**: `backend/app/main.py`

**Intent**: Register the cleanup job in `lifespan`, following the exact `scheduler.add_job(...)` shape used for `send_daily_reminders` — a daily cron trigger (once a day is sufficient given day-granularity retention).

**Contract**: New `scheduler.add_job(cleanup_old_snapshots, "cron", hour=<implementer's choice, e.g. 3>, args=[SessionLocal])` call alongside the existing job registration.

#### 4. Backend tests

**File**: new `backend/tests/test_restore_snapshot.py`

**Intent**: Cover the snapshot lifecycle end to end at the test level.

**Contract**: At minimum: (a) a snapshot row exists after a restore, with a payload matching the pre-restore data; (b) a second restore overwrites (not duplicates) the snapshot row for the same user; (c) no snapshot row is created when the user had no existing bills before restoring; (d) the cleanup job deletes rows older than the retention window and leaves fresher rows untouched; (e) a snapshot for one user is never visible/affected by another user's restore (scoping).

### Success Criteria:

#### Automated Verification:

- [ ] Backend test suite passes: `cd backend && uv run pytest tests/ -v`
- [ ] mypy passes: `cd backend && uv run mypy app`
- [ ] black formatting passes: `cd backend && uv run black --check --target-version py313 .`

#### Manual Verification:

- [ ] Restoring a backup for a user with existing bills creates a snapshot row visible via `http://localhost:8010/docs` (or direct DB query)
- [ ] Restoring for a brand-new user with zero bills creates no snapshot row

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Recovery API

### Overview

Add the endpoints the frontend needs to detect and act on an existing snapshot.

### Changes Required:

#### 1. Snapshot status endpoint

**File**: `backend/app/routers/export.py`

**Intent**: A read-only endpoint the dashboard can call on every load to check for a recoverable snapshot, scoped to `me.id` and filtered to only return snapshots still within the retention window (so a not-yet-cleaned-up expired row is never reported as recoverable).

**Contract**: `GET /export/last-snapshot` returning a schema with `created_at: datetime` when an active snapshot exists, or a 404 when none does (or none within retention).

#### 2. Restore-from-snapshot endpoint

**File**: `backend/app/routers/export.py`

**Intent**: Restores the user's data from their `RestoreSnapshot` payload (same destructive wipe-and-replace semantics as `restore_json`, but reading from the snapshot row instead of an uploaded file), then deletes the consumed snapshot row so it can't be replayed again.

**Contract**: `POST /export/restore-snapshot`, scoped to `me.id`, 404 if no snapshot row exists. Returns the same `{restored_templates, restored_instances}` shape as `restore_json` for consistency.

#### 3. Backend tests

**File**: `backend/tests/test_restore_snapshot.py` (extend from Phase 2)

**Intent**: Cover the new endpoints.

**Contract**: At minimum: (a) `GET /export/last-snapshot` returns 404 with no snapshot, returns `created_at` when one exists; (b) `POST /export/restore-snapshot` correctly restores the snapshot's data and removes the snapshot row afterward; (c) both endpoints are scoped per user (cross-user isolation, following `test_user_scoping.py`'s pattern); (d) `GET /export/last-snapshot` returns 404 for a snapshot older than the retention window even if the cleanup job hasn't run yet.

### Success Criteria:

#### Automated Verification:

- [ ] Backend test suite passes: `cd backend && uv run pytest tests/ -v`
- [ ] mypy passes: `cd backend && uv run mypy app`
- [ ] black formatting passes: `cd backend && uv run black --check --target-version py313 .`

#### Manual Verification:

- [ ] `GET /export/last-snapshot` and `POST /export/restore-snapshot` behave correctly via `http://localhost:8010/docs`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Frontend recovery banner

### Overview

Add the dashboard banner that surfaces an existing snapshot and lets the user restore it.

### Changes Required:

#### 1. API client functions

**File**: `frontend/src/lib/export-api.ts`

**Intent**: Typed fetches for the two new endpoints, using `apiFetch` for consistent 401/session-expiry handling.

**Contract**: `getLastSnapshot(): Promise<{ created_at: string } | null>` (translates the backend's 404 into a `null` return rather than throwing, since "no snapshot" is an expected, non-error state), `restoreFromSnapshot(): Promise<{ restored_templates: number; restored_instances: number }>`.

#### 2. Recovery banner component

**File**: new `frontend/src/components/SnapshotRecoveryBanner.tsx`

**Intent**: On mount, calls `getLastSnapshot()`. If a snapshot exists and its `created_at` doesn't match the last-dismissed timestamp stored in `localStorage`, renders a dismissible banner with a relative-time label and a "Restore Previous Data" button. Confirming opens a confirmation dialog (reusing the same `createPortal` modal pattern as `RestoreButton.tsx` for visual/interaction consistency — a destructive action deserves the same confirm-before-acting treatment), then calls `restoreFromSnapshot()` and reloads the page on success (matching `RestoreButton`'s existing post-restore behavior).

**Contract**: Dismissal state keyed by the snapshot's `created_at` string in `localStorage` (e.g. `pay-tracker-dismissed-snapshot`), so a new snapshot (different timestamp) always reappears even if the user dismissed a previous one.

#### 3. Mount point

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Render `SnapshotRecoveryBanner` at the dashboard layout level so it's visible across all dashboard pages, not just one.

**Contract**: Single new component render in the existing layout JSX.

#### 4. Locale strings

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent**: New `SnapshotRecoveryBanner` message namespace with the banner text, relative-time phrasing, confirm-dialog copy, and dismiss control — direct/plain tone matching `RestoreButton`'s existing voice.

**Contract**: New top-level namespace, consistent keys across all three files.

### Success Criteria:

#### Automated Verification:

- [ ] Frontend lint passes: `cd frontend && npm run lint`
- [ ] Frontend build passes (verify via `docker compose build frontend` if local build environment is unreliable, as encountered in the sibling `restore-safety-comparison` change): `cd frontend && npm run build`
- [ ] All three locale JSON files parse as valid JSON

#### Manual Verification:

- [ ] After restoring a backup (with prior existing data), the banner appears on the dashboard with a correct relative timestamp
- [ ] Clicking "Restore Previous Data" and confirming reverts to the pre-restore data and the banner disappears afterward
- [ ] Dismissing the banner hides it; it does not reappear on page reload unless a new restore creates a new snapshot
- [ ] No banner appears for a user with no snapshot
- [ ] Verified in both English and Polish

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: E2E coverage

### Overview

Cover the full snapshot-and-recovery flow end to end.

### Changes Required:

#### 1. Snapshot recovery scenario

**File**: new `frontend/tests/e2e/08-snapshot-recovery.spec.ts` (new file, since this is a distinct flow from `06-export-restore.spec.ts`'s upload/restore scenarios)

**Intent**: Create a bill, export a backup, restore it (creating a snapshot of the pre-restore state), reload the dashboard, assert the recovery banner is visible, click through to restore from the snapshot, and assert the original data is back and the banner is gone.

**Contract**: New Playwright test file following the existing `loginNewUser`/`createBillViaApi` helper pattern from `./helpers`.

#### 2. No-snapshot scenario

**File**: same new file

**Intent**: A fresh user with no prior restore sees no recovery banner.

**Contract**: New `test(...)` block in the same file.

### Success Criteria:

#### Automated Verification:

- [ ] Full e2e suite passes against the Docker stack: `docker compose up -d --wait --timeout 120 postgres backend frontend demo-data && cd frontend && npx playwright test --reporter=line`

#### Manual Verification:

- [ ] Both new e2e scenarios pass individually when run in isolation (`npx playwright test 08-snapshot-recovery --reporter=line`)

---

## Testing Strategy

### Unit Tests:

- Backend: snapshot creation/overwrite/skip-when-empty, cleanup job retention logic, recovery endpoint correctness and scoping (Phases 2-3).

### Integration Tests:

- E2E: full snapshot-and-recovery round trip, no-snapshot case (Phase 5).

### Manual Testing Steps:

1. Create 2 bills, export a backup, restore any backup — confirm a snapshot row now exists (via `/docs`) and the dashboard shows the recovery banner.
2. Click "Restore Previous Data," confirm — original 2 bills return, banner disappears.
3. Restore again as a fresh user with zero bills — no snapshot row, no banner.
4. Wait past the retention window (or temporarily set `RESTORE_SNAPSHOT_RETENTION_DAYS=0` for testing) and confirm the cleanup job removes the row and the banner stops appearing.

## Performance Considerations

Snapshot payload size mirrors a full backup export (already proven acceptable at household scale by the existing `/export/json` endpoint). The `GET /export/last-snapshot` check runs once per dashboard load — a single indexed lookup by `user_id`, negligible cost.

## Migration Notes

New table, no existing-data migration concerns. The unique constraint on `user_id` means no user can have more than one snapshot row at any time by construction.

## References

- Sibling change (separate, complementary): `context/archive/2026-07-10-restore-safety-comparison/` (S-18)
- Roadmap: `context/foundation/roadmap.md` S-19

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model, migration, and config

#### Automated

- [ ] 1.1 Migration applies cleanly: `docker compose exec backend uv run alembic upgrade head`
- [ ] 1.2 mypy passes: `cd backend && uv run mypy app`
- [ ] 1.3 black formatting passes: `cd backend && uv run black --check --target-version py313 .`

#### Manual

- [ ] 1.4 `\d restore_snapshots` shows expected columns, FK, and unique constraint

### Phase 2: Snapshot-on-restore + cleanup job

#### Automated

- [ ] 2.1 Backend test suite passes: `cd backend && uv run pytest tests/ -v`
- [ ] 2.2 mypy passes: `cd backend && uv run mypy app`
- [ ] 2.3 black formatting passes: `cd backend && uv run black --check --target-version py313 .`

#### Manual

- [ ] 2.4 Snapshot row created after restore for a user with existing bills
- [ ] 2.5 No snapshot row created for a fresh user with zero bills

### Phase 3: Recovery API

#### Automated

- [ ] 3.1 Backend test suite passes: `cd backend && uv run pytest tests/ -v`
- [ ] 3.2 mypy passes: `cd backend && uv run mypy app`
- [ ] 3.3 black formatting passes: `cd backend && uv run black --check --target-version py313 .`

#### Manual

- [ ] 3.4 `GET /export/last-snapshot` and `POST /export/restore-snapshot` behave correctly via `/docs`

### Phase 4: Frontend recovery banner

#### Automated

- [ ] 4.1 Frontend lint passes: `cd frontend && npm run lint`
- [ ] 4.2 Frontend build passes: `cd frontend && npm run build`
- [ ] 4.3 All three locale JSON files parse as valid JSON

#### Manual

- [ ] 4.4 Banner appears with correct relative timestamp after a restore
- [ ] 4.5 Restoring from the banner reverts data and the banner disappears
- [ ] 4.6 Dismissing hides the banner until a new snapshot is created
- [ ] 4.7 No banner for a user with no snapshot
- [ ] 4.8 Verified in both English and Polish

### Phase 5: E2E coverage

#### Automated

- [ ] 5.1 Full e2e suite passes against the Docker stack

#### Manual

- [ ] 5.2 Both new e2e scenarios pass individually when run in isolation
