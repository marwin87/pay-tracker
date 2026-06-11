---
change_id: db-schema-migration
title: DB Schema Migration
status: impl_reviewed
created: 2026-06-11
updated: 2026-06-11
roadmap_id: F-01
---

# DB Schema Migration

Foundation slice F-01. Fixes two model gaps, adds a missing DB constraint, updates
dependent code for the renamed field, and generates the initial Alembic migration so
all three tables exist in PostgreSQL.
