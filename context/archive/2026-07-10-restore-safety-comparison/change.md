---
change_id: restore-safety-comparison
title: Show current vs. backup comparison before confirming a restore
status: archived
created: 2026-07-10
updated: 2026-07-10
archived_at: 2026-07-10T12:19:27Z
---

## Notes

Roadmap slice S-18. Design already brainstormed and agreed in a prior session
(2026-07-10): before the user confirms a restore, show a comparison of
current data vs. the backup file (bill count, payment count, backup export
date) in the existing confirmation dialog, with a warning if the backup
would reduce data. New backend endpoint `GET /export/summary` (counts only,
scoped to current_user). Client-side JSON parsing of the picked file at
selection time (before the dialog), consistent with the existing 10MB
size-check pattern. Does not change `POST /export/restore`'s destructive
replace semantics — this is a pre-confirmation safety aid, not a data-loss
fix. See sibling roadmap item S-19 (restore-auto-backup-safety-net) for the
complementary server-side snapshot safety net — separate change, not in
scope here.
