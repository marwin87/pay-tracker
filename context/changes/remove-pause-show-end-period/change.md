---
change_id: remove-pause-show-end-period
title: Remove "pause recurrence" and show last payment month on Bills tile
status: implementing
created: 2026-10-05
updated: 2026-10-05
---

## Notes

`is_paused` duplicates `end_period` (stop generating instances, reversible by clearing the field).
Remove it; show `end_period` on the Bills tile so a finishing bill is visible at a glance.
