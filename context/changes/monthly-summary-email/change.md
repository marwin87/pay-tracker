---
change_id: monthly-summary-email
title: Month-end summary email with paid/unpaid overview and on-demand send
status: implementing
created: 2026-06-23
updated: 2026-06-23
archived_at: null
---

## Notes

Send a full monthly summary email on the last day of each month — what was paid (amount due vs. paid, date), what was missed/overdue, and totals. Configurable via a new `monthly_summary_enabled` toggle in Settings → Email Notifications (gated by master `email_reminders_enabled`). A "Send monthly summary now" button triggers the current month's report on demand (partial data is fine as a status snapshot). Automatic send piggybacks on the existing 30-min APScheduler job — no new cron needed. Multilingual en/pl/de, same pattern as existing reminder emails.
