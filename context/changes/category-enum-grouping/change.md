---
change_id: category-enum-grouping
title: Promote category to enum, group bills and payments by category
status: impl_reviewed
created: 2026-06-19
updated: 2026-06-19
reviewed: 2026-06-19
archived_at: null
---

## Notes

Category is currently a free-text string shown as a gray badge on the bills list but otherwise unused. This change promotes it to a predefined enum (Housing, Utilities, Insurance, Subscriptions, Entertainment, Transport, Healthcare, Education, Other), replaces the free-text combobox with a proper select, groups bill templates by category on the Bills page, and exposes category on payment records so the Payments page can also group rows by category.