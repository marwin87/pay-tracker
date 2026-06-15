# Data Backup — Plan Brief

> Full plan: `context/changes/data-backup/plan.md`

## What & Why

Implement FR-011: a one-click full data backup. The backend `/export/json`
endpoint already exists but exports only a partial snapshot — it omits `currency`,
`start_period`, `created_at` from bill templates, omits `created_at` from payment
instances, and exports no user data at all. The frontend has no backup UI
whatsoever. This plan completes both gaps.

## Starting Point

`backend/app/routers/export.py:86` has a working `GET /export/json` endpoint that
returns authenticated JSON. `frontend/src/lib/export-api.ts` has a `downloadXlsx`
function to copy as a pattern. No backup button exists in the UI.

## Desired End State

A Backup icon button lives in the nav bar between the language selector and theme
toggle. Clicking it opens a confirmation dialog. Confirming downloads a complete
`pay-tracker-backup-<date>.json` containing every column of every row in
`bill_templates`, `payment_instances`, and `users`, plus a `schema_version: 1`
field. The UI is translated in EN, PL, and DE.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Backup scope | Full 1:1 DB snapshot (all tables, all fields) | Enables a complete future restore without out-of-band user re-creation | Plan |
| Include user data | Yes (incl. `password_hash`) | Needed for a self-hosted restore; file stays on user's device | Plan |
| `schema_version` | Add `schema_version: 1` | Zero-cost future-proofing for import tooling | Plan |
| UI placement | Nav bar, between language and theme toggle | Consistent with existing settings controls; low discoverability cost | Plan |
| Interaction | Confirmation dialog before download | User-requested; prevents accidental downloads of sensitive data | Plan |
| Import/restore | Out of scope | Deferred to a future change; download-only is sufficient for FR-011 | Plan |

## Scope

**In scope:** Fix `/export/json` backend format; `downloadBackup()` API client
function; `BackupButton` component with dialog; nav wiring; EN/PL/DE translations.

**Out of scope:** Import/restore endpoint; scheduled backups; server-side backup
storage; per-table selective export.

## Architecture / Approach

Backend: single file edit (`export.py`) — add User query, expand template and
instance dicts to include all columns, add `schema_version`.  
Frontend: new component `BackupButton.tsx` (self-contained, owns dialog state)
imported into `dashboard/layout.tsx`. Follows ThemeToggle pattern for the
trigger and ArchiveConfirmDialog pattern for the modal.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend format fix | Complete JSON snapshot at `/export/json` | Decimal/datetime serialization must be handled explicitly |
| 2. Frontend UI | Nav button + dialog + translations | `HardDriveDownload` icon availability in current lucide-react version |

**Prerequisites:** Docker running (`docker compose up --build`)  
**Estimated effort:** ~1 session, 2 phases

## Open Risks & Assumptions

- `HardDriveDownload` icon must exist in the installed lucide-react version;
  fall back to `Download` if not found
- Any authenticated user can download the full backup (including other users'
  password hashes) — appropriate for a single-household self-hosted deployment,
  but worth noting

## Success Criteria (Summary)

- `GET /export/json` returns a JSON file with `schema_version`, `users`,
  `bill_templates` (all fields), and `payment_instances` (all fields)
- Backup button is visible in nav, opens a confirmation dialog, and downloads
  the file on confirm
- No regressions on existing xlsx export
