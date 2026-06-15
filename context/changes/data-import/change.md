---
id: data-import
title: Data Restore from Backup
status: planned
created: 2026-06-15
updated: 2026-06-15
prd_refs: []
depends_on:
  - data-backup
---

# Data Restore from Backup

Two-entry-point restore: fresh-install setup page (unauthenticated, gated on
empty DB) and a nav-level RestoreButton for logged-in users (anytime, wipe +
restore + logout). Depends on data-backup for the JSON format spec.
