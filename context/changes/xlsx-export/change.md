---
id: xlsx-export
title: .xlsx export — year-by-month spreadsheet download
status: implemented
created: 2026-06-13
updated: 2026-06-15
prd_refs:
  - FR-010
roadmap_id: S-04
prerequisites:
  - S-01 (auth)
---

## Summary

User can export all payment history for the current year to a downloadable `.xlsx` spreadsheet file directly from the Payments page. The file has 12 worksheets (Jan–Dec), one per month, each with columns: Bill, Category, Period, Due Date, Amount, Currency, Status, Paid Amount, Paid At, Notes.
