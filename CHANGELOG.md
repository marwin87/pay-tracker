# Changelog

Notable changes to Pay Tracker, release by release.

## v1.1.0

### Features

- Per-user editable categories: create, rename, recolor, and archive categories, with backup/restore support
- Telegram reminders per user; email reminders now sent via Apprise. All notifications are off by default for new users
- Selective backup: choose which sections to export, and restore them partially
- Delete account, with full data cascade
- Default currency preference (plus CNY support)
- Interface languages: Spanish, Italian, French and Chinese added; choose which languages appear in the switcher
- Settings page regrouped into tabs (Account, Preferences, Notifications, Categories, Data), with the active tab kept in the URL
- Filters on Payments, Bills, and Archive views (multi-select category and status), plus category & status sorting
- Collapsible calendar view on Payments, marking days that have bills due
- "Mark as Paid" now includes a payment date field, and reverting a payment asks for confirmation
- Archived bills can be restored
- Archived categories are now flagged in filters and group headers instead of silently disappearing
- Show/hide toggle on password fields
- Recurring bills can now have an end month, so installments and fixed-term contracts stop generating payments and reminders after the last one
- Custom repeat interval: bills can repeat every 1–12 months or every 1–5 years (e.g. every 4 months, every 2 years). Existing "Every 2 months" and "Quarterly" bills were converted automatically with the same schedule, and older backups still import

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

## v1.0.2 — 2026-07-20

### Features

- Restore safety net: data is automatically snapshotted before a restore, with self-serve undo
- Restore preview: compare current data with the backup before confirming a restore

### Fixes

- Session expiry is now detected reliably: automatic logout and redirect to login
- Minimum password length of 8 characters enforced on registration
- Frontend arm64 image built on a native runner instead of QEMU
- CI: added mypy type-checking and dependency vulnerability audits

## v1.0.1 — 2026-07-01

### Fixes

- Release images are now built for both amd64 and arm64

## v1.0.0 — 2026-07-01

First release.

### Features

- Bill templates (one-off, recurring, annual) with automatic, idempotent payment generation; archive instead of delete
- Payments page: mark as paid (optional amount), revert payment, delete a single instance or all future entries, year navigation up to one year ahead
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
