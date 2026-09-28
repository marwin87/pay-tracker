# Changelog

Notable changes to Pay Tracker, release by release.

## v1.2.0 (Not released yet)

### Features

- Search bills and payments by name on the Payments, Bills, and Archived Bills pages
- Dropdown menus and the category filter's checkbox list can now be navigated with the keyboard: arrow keys, Home and
  End move through options, matching the accessibility semantics they already advertised
- Unpaid payments can now have their due date edited for that instance only, via the existing edit-payment dialog
- Redesigned all auth screens (login, register, forgot-password, reset-password)
- Unified the whole app's look with the new auth screens: warmer background, two-tone nav wordmark, and every
  dialog/form's primary action is now a solid button (Cancel/secondary actions stay outline)
- XLSX export now opens on the current month's tab, auto-sizes columns to their content, and colors the Status column
  (matching the app's status colors) plus a left-border accent on the Category column (matching each category's color)

### Security

- Backend, frontend and demo-seed containers now run as non-root users

### License

- Starting with this release, Pay Tracker is no longer MIT-licensed: non-commercial use, modification and redistribution
  remain free with attribution, but commercial use now requires the copyright holder's written permission. All releases
  up to and including v1.1.0 stay MIT. See [LICENSE](LICENSE).

### Fixes

- Settings page now warns about unsaved changes before logging out, not just before following a link
- `/server-time` and backup-restore endpoints now return typed, schema-validated responses instead of raw JSON objects
- Payment dialogs (mark as paid, delete, revert) now render through the same portal-to-body pattern as every other
  dialog, instead of inline in the page
- Corrected foreign-key metadata on bill templates and payment instances to match the database's actual cascade
  behavior, closing a drift between the test schema and production
- Search field is full width on mobile (Payments, Bills, Archive)
- Settings page: mobile now uses a per-section accordion instead of a horizontally-scrolling tab strip
- Category color picker separates unused colors from already-used ones and labels each group; palette expanded with more
  distinct colors
- "Add category" button and the unsaved-changes / archive-bill dialogs restyled to match the rest of the app (previously
  solid-red buttons with no dark-mode support)
- Save/Cancel button order made consistent everywhere (Cancel always first)
- Category expanders on Payments/Bills/Archive now reset to expanded on every login instead of remembering a previous
  session's state

## v1.1.0 — 27-09-2026

### Features

- Per-user editable categories: create, rename, recolor, and archive categories, with backup/restore support
- Telegram reminders per user; email reminders now sent via Apprise. All notifications are off by default for new users
- Selective backup: choose which sections to export, and restore them partially
- Delete account, with full data cascade
- Default currency preference (plus CNY support)
- Interface languages: Spanish, Italian, French and Chinese added; choose which languages appear in the switcher
- Settings page regrouped into tabs (Account, Preferences, Notifications, Categories, Data), with the active tab kept in
  the URL
- Filters on Payments, Bills, and Archive views (multi-select category and status), plus category & status sorting
- Collapsible calendar view on Payments, marking days that have bills due
- "Mark as Paid" now includes a payment date field, and reverting a payment asks for confirmation
- Archived bills can be restored
- Archived categories are now flagged in filters and group headers instead of silently disappearing
- Show/hide toggle on password fields
- Recurring bills can now have an end month, so installments and fixed-term contracts stop generating payments and
  reminders after the last one
- Custom repeat interval: bills can repeat every 1–12 months or every 1–5 years (e.g. every 4 months, every 2 years).
  Existing "Every 2 months" and "Quarterly" bills were converted automatically with the same schedule, and older backups
  still import

### Security

- Hardened cookies/sessions: secure cookies, CSRF protection, logout token revocation
- Access tokens now require iss/aud claims
- CSP and other hardening headers sent from the proxy middleware
- Swagger/ReDoc/OpenAPI docs disabled outside development
- Patched high-severity vulnerabilities in next and pyasn1

### Fixes

- One-off bills now correctly generate a payment instance
- Unpaid payments now suggest the current template price
- xlsx export localized and backfilled to a full year of instances
- Fixed login/dashboard hydration mismatch
- Payment note moved out of the popup onto its own line
- Enlarged the calendar day tile count badge and thickened the today marker for readability
- Frontend build now correctly wires in NEXT_PUBLIC_API_URL
- Various Docker build fixes
- Consistent button, checkbox, and dropdown styling; action buttons aligned to ghost/outline style
- Localized auth error messages

## v1.0.2 — 20-07-2026

### Features

- Restore safety net: data is automatically snapshotted before a restore, with self-serve undo
- Restore preview: compare current data with the backup before confirming a restore

### Fixes

- Session expiry is now detected reliably: automatic logout and redirect to login
- Minimum password length of 8 characters enforced on registration
- Frontend arm64 image built on a native runner instead of QEMU
- CI: added mypy type-checking and dependency vulnerability audits

## v1.0.1 — 01-07-2026

### Fixes

- Release images are now built for both amd64 and arm64

## v1.0.0 — 01-07-2026

First release.

### Features

- Bill templates (one-off, recurring, annual) with automatic, idempotent payment generation; archive instead of delete
- Payments page: mark as paid (optional amount), revert payment, delete a single instance or all future entries, year
  navigation up to one year ahead
- Bills and payments grouped by category
- Currencies: PLN, EUR, USD and custom
- Interface languages: English, Polish, German, with per-user preference
- Registration, login, session management, forgot/reset password via email token
- Per-user data scoping
- Excel (xlsx) export, full JSON backup and restore
- PWA: installable, with browser notifications for due bills
- Email reminders and month-end summary email, with per-user toggles; missed reminders caught up on startup
- Settings page and green branding with new logo
- Docker Compose deployment with PostgreSQL 17 as a separate service and demo data
- Multi-arch images published to GHCR from CI, with Playwright E2E suite and 80% backend test coverage
