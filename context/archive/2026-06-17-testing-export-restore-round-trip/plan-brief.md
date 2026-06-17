# Export/Restore Round-Trip Test Coverage — Plan Brief

> Full plan: `context/changes/testing-export-restore-round-trip/plan.md`
> Research: `context/changes/testing-export-restore-round-trip/research.md`

## What & Why

Add integration tests proving the backup→restore path is lossless and backward-compatible. The test plan (Phase 3) covers Risk #5 (restore silently drops or corrupts instances) and Risk #6 (v2 backups missing reminder fields restore with wrong defaults). Includes a prerequisite production fix: both export endpoints currently include soft-deleted instances, which would cause a round-trip to resurrect deleted rows.

## Starting Point

Six integration tests exist in `backend/tests/test_restore.py` (PostgreSQL via testcontainers, Phase 2 complete). The existing happy-path test does a partial round-trip but compares only array lengths and one `name` field — it cannot catch field truncation, reminder-field defaults, or XLSX row drops.

## Desired End State

After this change: exports exclude soft-deleted instances; a seed→export→restore→re-export cycle matches all schema fields (excluding remapped ids); a v2 backup (no reminder fields) restores with `False` defaults; the XLSX row count for a year equals the live instance count.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| is_deleted export gap | Fix export filter (production fix) | Leaves the bug unfixed otherwise; cheap change while already in this file | Plan |
| Round-trip comparison depth | All exported schema fields (minus id) | Catching field truncation is exactly what Risk #5 requires | Plan |
| XLSX coverage | Include row-count test in Phase 3 | Risk #5 explicitly names XLSX as a failure scenario | Plan |
| v2 payload construction | Omit reminder keys from instance dict | Including keys (even with schema_version: 2) uses the provided values, not Pydantic defaults | Research |
| Instance comparison sort key | `(period, amount)` | IDs are remapped on restore; this is the next most stable unique key given test seed design | Plan |

## Scope

**In scope:**
- `is_deleted` filter fix on both JSON and XLSX export queries
- Field-level JSON round-trip test (seed → export → restore → re-export → compare all fields)
- v2 backward-compat test (missing reminder fields → False defaults)
- v3 reminder-flag preservation test (True flags survive restore)
- XLSX row-count test (live instances only, deleted excluded)

**Out of scope:**
- Schema version rejection, orphaned-instance, user isolation, auth tests (already covered)
- XLSX column formatting or value correctness beyond row count
- Any new schema version or model changes

## Architecture / Approach

Phase 1 makes two filter additions to the production export router. Phases 2–3 add five new integration tests following existing patterns: `client` fixture (PostgreSQL), `register_and_login()`, `_make_backup()` / new `_make_instance_dict()` helper, `_upload()`. No new test infrastructure needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Fix export filters | `is_deleted == False` on both export queries | Existing tests must still pass after filter additions |
| 2. JSON round-trip + compat tests | 3 new tests in `test_restore.py`; full field-level comparison + v2/v3 compat | Sort key must be stable; true v2 payload must omit reminder keys |
| 3. XLSX row-count test | 2 new tests in `test_export_xlsx.py`; openpyxl parsing | Empty-month sheets must be correctly counted as 0 rows |

**Prerequisites:** Phase 2 (PostgreSQL test infra) complete — ✓ done  
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- Mark-paid endpoint name needs confirming (`PATCH /bills/payments/{id}` or similar) before implementing the field-level round-trip test in Phase 2; the IDOR research from Phase 2 should have surfaced this
- `openpyxl` is assumed to be in `backend/pyproject.toml` (used in production for XLSX generation); no new dependency needed

## Success Criteria (Summary)

- `pytest backend/tests/test_restore.py` — 9 tests pass (6 existing + 3 new)
- `pytest backend/tests/test_export_xlsx.py` — 2 tests pass (new file)
- Full suite (`pytest backend/tests/ -q`) green with zero regressions
