# Data Restore from Backup — Plan Brief

> Full plan: `context/changes/data-restore/plan.md`

## What & Why

Add the ability to restore a user's data from a JSON backup file — the counterpart to the existing `GET /export/json` endpoint (FR-011). Without restore, the backup feature is a one-way street: users can export but have no path back if they need to migrate or recover data.

## Starting Point

`GET /export/json` already produces a complete `schema_version: 2` backup containing `bill_templates` and `payment_instances`. `BackupButton.tsx` provides the download trigger in the dashboard header. No restore endpoint or UI exists.

## Desired End State

A user clicks a restore icon button next to the existing BackupButton, picks a `.json` backup file, reads a warning that their current data will be permanently replaced, confirms, and sees their account data atomically replaced with the backup contents. Invalid files (wrong schema version, orphaned instances) are rejected with a clear error — no data is touched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Restore mode | Replace (wipe + import) | Deterministic outcome — end state matches the backup exactly, no merge heuristics needed | Plan |
| Failure behavior | Atomic rollback | No partial state — either the restore fully succeeds or nothing changes | Plan |
| Schema version policy | Accept only v2 | All current backups are v2; no v1 files exist in the field | Plan |
| Orphaned instances | Hard reject whole file | Silent data loss violates the PRD no-data-loss guardrail | Plan |
| UI placement | Sibling of BackupButton in header | Pairs logically with backup; no new routes needed | Plan |
| Confirmation UX | Two-step modal (picker → warning) | Destructive action needs explicit warning before commit | Plan |
| Testing scope | Backend integration tests only | Mirrors the existing export test pattern; UI file-upload E2E is brittle | Plan |

## Scope

**In scope:**
- `POST /export/restore` endpoint (multipart file upload, atomic replace)
- `BackupTemplate`, `BackupInstance`, `BackupPayload` Pydantic schemas
- `RestoreButton.tsx` component with two-step modal
- `restoreFromBackup(file)` in `export-api.ts`
- i18n keys in en/pl/de locale files
- 6 backend integration tests

**Out of scope:**
- Merge mode / deduplication
- Schema v1 → v2 migration
- XLSX restore
- Frontend E2E tests
- Settings page

## Architecture / Approach

The restore endpoint lives in the existing `export.py` router (`POST /export/restore`) to keep the backup/restore pair co-located. ID remapping is the core technical step: templates are inserted fresh and receive new DB IDs; a `{backup_id → new_id}` dict is built during insertion and applied to each `PaymentInstance.bill_id` before insert. The full operation runs in a single SQLAlchemy transaction — delete all user data, insert templates, flush, remap, insert instances, commit.

The `RestoreButton` component replicates the `BackupButton.tsx` state machine + `createPortal` modal pattern exactly, keeping the header UI consistent.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend endpoint | `POST /export/restore` with full validation and atomic replace | ID remapping logic must correctly handle the old→new template ID translation |
| 2. Frontend component | RestoreButton in header, two-step modal, i18n | File input + FormData upload plumbing |
| 3. Integration tests | 6 test scenarios covering happy path and failure modes | Cascade delete order (instances before templates if no ORM cascade) |

**Prerequisites:** Docker Compose stack running (backend + DB). No new migrations needed.
**Estimated effort:** ~1-2 sessions across 3 phases.

## Open Risks & Assumptions

- `BillTemplate` → `PaymentInstance` cascade behaviour must be verified before choosing the delete order in Phase 1 (one delete loop vs two).
- The `HardDriveUpload` icon must exist in the version of `lucide-react` currently installed; if not, `Upload` is the fallback.

## Success Criteria (Summary)

- A user can restore a previously downloaded backup and see their data replaced correctly on the next page load.
- Invalid backup files are rejected with a clear, user-visible error and no data mutation.
- All existing export tests continue to pass after the restore endpoint is added.
