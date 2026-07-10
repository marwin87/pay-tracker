---
change_id: restore-auto-backup-safety-net
title: Restore auto backup safety net
status: archived
created: 2026-07-10
updated: 2026-07-10
archived_at: 2026-07-10T14:13:37Z
---

## Notes

Roadmap slice S-19. Complementary safety net to sibling change
`restore-safety-comparison` (S-18): immediately before `POST /export/restore`
executes its destructive delete-and-replace of the user's bill templates and
payment instances, the server automatically snapshots the current data so
it can be recovered if the restore was a mistake. This holds even when the
user proceeds past S-18's warning, or when the request bypasses the UI
entirely (e.g. a direct API call) — S-18 prevents the mistake in the UI;
this catches it after the fact regardless of entry point.

Open unknowns to resolve during planning (see roadmap S-19):
- **Snapshot storage & retention** — where the pre-restore snapshot is kept
  (temp DB table, object-storage blob, downloadable response artifact) and
  how long it's retained before being discarded.
- **Recovery path** — whether the user self-serves recovery (e.g. a
  "download last snapshot" button) or it's an operator/support-only
  mechanism. This materially affects scope.

Must not slow down or partially fail the restore transaction itself; needs
its own test coverage (snapshot taken, snapshot survives restore, snapshot
scoped correctly per user).
