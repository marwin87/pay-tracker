---
id: per-user-data-scoping
title: Per-User Data Scoping
status: impl_reviewed
created: 2026-06-15
updated: 2026-06-15
prd_refs:
  - FR-020
roadmap_id: S-11
---

# Per-User Data Scoping

Add `user_id` FK to `BillTemplate` and scope every bill, payment, and export query to
the authenticated user. Closes the data-isolation gap where any authenticated user can
read or mutate any other user's financial data.
