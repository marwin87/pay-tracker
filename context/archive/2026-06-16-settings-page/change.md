---
change_id: settings-page
title: Settings page
status: archived
created: 2026-06-16
updated: 2026-06-16
reviewed: 2026-06-16
archived_at: 2026-06-16T13:12:43Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->
New setting page should in navigation menu, before Logout button.
Setting page contains all current (and future) settings like:
- User profile : email and password change
- Email notification setup (cron configuration)
- Browser notification
- Backup data
- Restore data

Each section has own Save/Cancel button.

UI Design:
[Icon Header]
[Feature config section]
[Save change]

Page Order:
[User profile]
[Email Notification]
[Browser notification]
[Backup data]
[Restore data]

Feature config details:
- User profile: user can change email and password.
- Email notification: user can choose when email will be sent. Predefined options: 2 days before due date, 1 day before due date, On the payment date, one day after due date. All options are checkboxes. 
- Browser notification: User can enable or disable this feature. Information/Warning is show when feature is disabled by the browser/operating system setting.
- Backup: One sentence explanation with button.
- Restore: One sentence explanation with button.

UI Styling:
Features should be built as tiles and have own icon plus header.
Sections should have own colors:
- user profile - blue
- email and browser notifications - yellow
- backup and restore - red