---
change_id: testing-recurrence-unit
title: Recurrence unit tests — period math and next-instance generation
status: impl_reviewed
created: 2026-06-17
updated: 2026-06-17
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Recurrence unit tests".
Risks covered: Risk #1 (mark-paid silently fails to create next-period instance), Risk #2 (period math wrong at month boundaries).
Test types planned: pure Python unit tests (no DB required).
Risk response intent:
- Risk #1: prove that calling mark-paid causes exactly one new instance to appear for the correct next period; a second call produces no duplicate; must also test paused-template guard and one_off guard; challenge assumption that "mark-paid returns 200" implies next-period instance was created; avoid happy-path only.
- Risk #2: prove due_day=31 in February returns last day of Feb, December→January correctly increments year, leap-year Feb 29 handled; derive expected dates independently — do not copy the production formula as expected value.
After creating the folder, suggest running /10x-research as the next natural command.
