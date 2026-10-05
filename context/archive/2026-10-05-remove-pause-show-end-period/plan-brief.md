# Remove "pause recurrence", show last payment month on Bills tile — Plan Brief

> Full plan: `context/changes/remove-pause-show-end-period/plan.md`

## What & Why

Remove the "Wstrzymaj cykl" (`is_paused`) flag. It does the same thing as setting the last payment month (`end_period`): stop creating new instances. Also show the last payment month on the Bills tile.

## Starting Point

`is_paused` lives in the DB, API, backup, form, tile badge, 7 locales, demo data, and tests. `end_period` already exists and is honored by the generator, but the tile does not show it.

## Desired End State

One way to end a cycle. Bills with a last payment month show "Last payment: <month year>" on their tile. Previously paused bills were converted to an end month by the migration.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Existing paused bills | Migration sets `end_period` = month of last non-deleted instance, else current month | Keeps their "no new payments" behavior |
| Old backups | Field simply dropped, no conversion | No old backups exist; backup stays consistent with the schema |
| Tile placement | Muted text in line 2 after the due label | Matches the existing layout, no height change |
| Month format | Same `Intl.DateTimeFormat` as the form | Consistent, localized |

## Scope

**In scope:** DB column, API, backup, services, UI, locales, demo data, PRD/test-plan wording, tests.

**Out of scope:** old-backup conversion, new resume UX, changes to how `end_period` works.

## Architecture / Approach

Backend first (hand-written migration, then remove field and guards), then frontend (remove UI, add tile text, e2e), then demo/docs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend | Migration + flag removed, tests updated | Migration conversion edge cases (no instances, end before start) |
| 2. Frontend | Pause UI gone, tile shows last payment month | Strict-JSON locale files, tile line wrapping on mobile |
| 3. Demo/docs | Seed data and docs cleaned | Low |

**Prerequisites:** none.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Paused state is not restorable on downgrade.
- Assumes a single user with no old backups.

## Success Criteria (Summary)

- No `is_paused` left outside old migrations.
- Previously paused bills still generate nothing new.
- The tile shows the last payment month when set.
