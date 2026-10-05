# Remove "pause recurrence", show last payment month on Bills tile — Implementation Plan

## Overview

Drop the `is_paused` flag from `BillTemplate` end to end (DB, API, backup, UI) and surface `end_period` on the Bills page tile. `end_period` already covers "stop generating instances"; the flag is a second, weaker way to do the same thing.

## Current State Analysis

- `is_paused` is read in exactly three behavioural places: `_seed_period` filter (`backend/app/services/recurrence.py:131`), the mark-paid guard (`backend/app/routers/bills.py:243`), and two filters in `reminder_job.py:230` and `export_xlsx.py:89`.
- It is also carried through the model (`models/bill.py:62`), schemas (`schemas/bill.py:41,50,65,91,188`), backup export/restore (`services/backup.py:201,324`), the frontend form/row/types, 7 locale files, demo seed data, and ~25 test payloads.
- `end_period` already exists on the model, schemas, form, and backup, and is not shown on the Bills tile (`BillTemplateRow.tsx`), only in the form hint (`BillTemplateForm.tsx:270`).
- `generate_next_instance` and `_bill_active_in_period` already honor `end_period`, so removing the pause guards loses no capability.
- Alembic head: `c6d7e8f9a0b1`. `context/foundation/lessons.md`: write migrations by hand, read autogenerate output.

## Desired End State

- No `is_paused` anywhere (column, API, backup JSON, UI, i18n, demo, docs).
- Existing paused bills keep their "no new payments" behavior: the migration converts each to an `end_period`.
- A bill with `end_period` shows "Last payment: <month year>" on its Bills tile.
- Verify: `grep -ri "is_paused\|isPaused"` finds nothing outside old migrations; backend suite and e2e pass.

### Key Discoveries:

- Backup restore schema has `is_paused: bool` as required (`schemas/bill.py:188`); the user confirmed there are no old backups, so the field is simply removed (pydantic ignores unknown keys anyway).
- Month display already exists in the form: `Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })` (`BillTemplateForm.tsx:271`). Reuse that formatting for the tile.
- `pauseRecurrence` label key does not contain the string "paused"; grep for `pauseRecurrence` separately when cleaning locales.

## What We're NOT Doing

- No conversion logic for old backup files containing `is_paused` (no such files exist).
- No new "resume" UX; clearing `end_period` already resumes the cycle.
- No change to how `end_period` itself works (the instance-cutting behavior was fixed separately).

## Implementation Approach

Three phases: backend first (migration + removal, so the API stops exposing the field), then frontend (remove the UI, add the tile text), then demo/docs cleanup. Each phase leaves the app working.

## Critical Implementation Details

- **State sequencing** — the migration must compute `end_period` from `is_paused` *before* dropping the column, all in one revision, and read `payment_instances` as they are at that moment.

## Phase 1: Backend — data-preserving migration and flag removal

### Overview

Convert paused bills to `end_period`, drop the column, and delete every backend use.

### Changes Required:

#### 1. Alembic revision

**File**: `backend/alembic/versions/<new>_drop_is_paused_from_bill_templates.py` (down_revision `c6d7e8f9a0b1`)

**Intent**: For each template with `is_paused = true`, set `end_period` so generation stops where it effectively stopped, then drop `is_paused`.

**Contract**: For a paused template: `last` = max `period` of its non-deleted instances, else the current `YYYY-MM`. New `end_period = max(start_period or last, last)` (never before `start_period`); if the template already has an `end_period`, keep the earlier of the two. Written by hand with `op.get_bind()` and SQL/Python, not autogenerate. `downgrade()` re-adds `is_paused` as `Boolean, server_default false, not null` (paused state is not restorable; note it in the docstring).

#### 2. Model and schemas

**Files**: `backend/app/models/bill.py`, `backend/app/schemas/bill.py`

**Intent**: Remove the `is_paused` field from `BillTemplate`, the create/update/out schemas, the `BackupTemplate` schema, and from the required-fields set at `schemas/bill.py:50`.

**Contract**: API payloads and backup JSON no longer contain `is_paused`.

#### 3. Behavioural guards

**Files**: `backend/app/services/recurrence.py:131`, `backend/app/routers/bills.py:242-244`, `backend/app/services/reminder_job.py:230`, `backend/app/services/export_xlsx.py:89`, `backend/app/services/backup.py:201,324`

**Intent**: Delete the `is_paused` filters/guards; mark-paid always calls `generate_next_instance`; backup export/restore stop reading/writing the field.

**Contract**: Behavior for non-paused bills is unchanged.

#### 4. Tests

**Files**: `backend/tests/*` (payload dicts listed by `grep -rn is_paused backend/tests`), `backend/tests/test_recurrence_service.py:192-210,448`

**Intent**: Remove `is_paused` from fixtures/payloads, the `is_paused` parameter of `_make_bill`, and the paused-template test at line 448. Drop `"is_paused"` from the null-on-required-field parametrization (`test_bills_create.py:327`). Add a migration check: a paused bill with instances ends up with `end_period` = last instance month, one without gets the current month, and an existing earlier `end_period` is preserved.

### Success Criteria:

#### Automated Verification:

- Migration applies on a DB with paused bills: `docker compose exec backend alembic upgrade head`
- Backend suite passes: `cd backend && uv run pytest tests -q`
- No leftovers: `grep -rn "is_paused" backend/app backend/tests`

#### Manual Verification:

- A bill that was paused before the migration shows the expected last payment month in the edit form and generates no new instances.

---

## Phase 2: Frontend — remove pause UI, show end period on the tile

### Overview

Delete the checkbox, badge, warning, and types; add the last payment month to the tile.

### Changes Required:

#### 1. Pause UI removal

**Files**: `frontend/src/components/bills/BillTemplateForm.tsx` (state at 82, payload at 145, warning at 277-278, checkbox at 309-310), `frontend/src/components/bills/BillTemplateRow.tsx` (amber border 69-72, opacity 80, badge 89-94, payload at 174, `PauseCircle` import), `frontend/src/lib/bills-api.ts:20,35`

**Intent**: Remove all `is_paused` state, props, and visuals; the border is always the category color.

**Contract**: `BillTemplate` / `BillTemplateUpdate` types no longer have `is_paused`.

#### 2. Last payment month on the tile

**File**: `frontend/src/components/bills/BillTemplateRow.tsx`

**Intent**: When `template.end_period` is set, show "Last payment: <month year>" in line 2, after the due label, in the same muted text style as "Due on".

**Contract**: Month is formatted with `Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })` from the `YYYY-MM` string (parse year/month, use day 1 to avoid timezone shifts). New message key `BillTemplateRow.lastPayment` with `{month}` placeholder in all 7 locales.

#### 3. Locales

**Files**: `frontend/messages/{pl,en,de,es,fr,it,zh}.json`

**Intent**: Remove `endPeriodPaused`, `pauseRecurrence`, `paused`; add `lastPayment`. Files must stay strict JSON (no trailing commas); check each one, the formatter hook only touches the edited file.

#### 4. E2E

**Files**: `frontend/tests/e2e/helpers.ts:143`, `11-edit-bill.spec.ts:40-49`, `20-bill-end-period.spec.ts:90-104`

**Intent**: Remove the pause step/assertion and the "pausing shows a warning" test; add a test that a bill with an end month shows "Last payment" on its Bills tile and a bill without one does not.

### Success Criteria:

#### Automated Verification:

- Lint passes: `cd frontend && npm run lint`
- Type/build passes: `cd frontend && npm run build`
- E2E passes: `cd frontend && npx playwright test 11-edit-bill 20-bill-end-period`
- No leftovers: `grep -rniE "is_paused|isPaused|pauseRecurrence|endPeriodPaused" frontend/src frontend/messages frontend/tests`

#### Manual Verification:

- Tile shows the last payment month on desktop and on a phone-width screen without breaking line 2.
- Form no longer has the pause checkbox; saving a bill works.

---

## Phase 3: Demo data and docs

### Overview

Remove the flag from seed data and foundation docs.

### Changes Required:

#### 1. Demo data

**Files**: `demo/seed_data.json` (all `is_paused` keys; "Newspaper Subscription" at ~308 loses the "Paused while traveling" note and just keeps its `end_period`), `demo/README.md:33`

**Intent**: Drop the key everywhere; reword the README row.

#### 2. Foundation docs

**Files**: `context/foundation/prd.md:98,129,262-264`, `context/foundation/test-plan.md:59`

**Intent**: Replace "paused flag" wording with `end_period`; test plan loses the paused-template guard from risk #1.

### Success Criteria:

#### Automated Verification:

- Seed file is valid JSON: `python3 -c "import json;json.load(open('demo/seed_data.json'))"`
- No leftovers: `grep -rniE "is_paused|paused flag" demo context/foundation`

#### Manual Verification:

- Fresh `docker compose down -v && docker compose up --build` loads the demo data without errors.

---

## Testing Strategy

### Unit Tests:

- Migration conversion cases (instances present, none, existing earlier `end_period`, `end_period` before `start_period` clamp).
- Existing recurrence/mark-paid tests keep passing without the guard.

### Integration Tests:

- Restore of a fresh export round-trips without `is_paused`.

### Manual Testing Steps:

1. Create a bill with a last payment month; check the tile text.
2. Clear the month; the text disappears and the cycle continues.
3. Export and restore a backup; both work.

## Migration Notes

Migrations run automatically on backend start (`backend/Dockerfile`). The paused state is not recoverable on downgrade; acceptable for a single-user app.

## References

- `backend/app/services/recurrence.py` (seeding, `is_last_instance`)
- `frontend/src/components/bills/BillTemplateForm.tsx:270` (existing month formatting)
- `context/foundation/lessons.md` (hand-written migrations)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — data-preserving migration and flag removal

#### Automated

- [x] 1.1 Migration applies on a DB with paused bills
- [x] 1.2 Backend suite passes
- [x] 1.3 No `is_paused` left in backend/app and backend/tests

#### Manual

- [ ] 1.4 Previously paused bill shows the expected last payment month and generates no new instances

### Phase 2: Frontend — remove pause UI, show end period on the tile

#### Automated

- [x] 2.1 Lint passes
- [x] 2.2 Build passes
- [ ] 2.3 E2E 11-edit-bill and 20-bill-end-period pass
- [x] 2.4 No pause leftovers in frontend

#### Manual

- [ ] 2.5 Tile shows last payment month on desktop and phone width
- [ ] 2.6 Form has no pause checkbox and saves

### Phase 3: Demo data and docs

#### Automated

- [x] 3.1 Seed file is valid JSON
- [x] 3.2 No pause leftovers in demo and foundation docs

#### Manual

- [ ] 3.3 Fresh clean start loads demo data
