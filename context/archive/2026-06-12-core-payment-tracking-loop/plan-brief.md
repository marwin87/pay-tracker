# Core Payment Tracking Loop — Plan Brief

> Full plan: `context/changes/core-payment-tracking-loop/plan.md`

## What & Why

S-03 is the roadmap north star: the smallest end-to-end slice that proves the core product hypothesis. A user creates a bill template, views this month's instance on a payments dashboard, marks it paid (with optional amount override), and next month's instance appears automatically — with no manual action. This is US-01 from the PRD and the prerequisite for every remaining slice (PWA, dual-deploy, export).

## Starting Point

The backend payment loop is largely built: the list endpoint (`GET /bills/payments`), the mark-paid endpoint (`POST /bills/payments/{id}/pay`), and the recurrence service that auto-generates next-period instances are all in place. What's missing is (a) a service function to seed the current month's instances on page load, (b) dynamic overdue status computation, and (c) the entire frontend — zero payment instance UI exists.

## Desired End State

The user opens `/dashboard/payments`, sees this month's bills sorted by due date with color-coded status badges (upcoming = blue, overdue = red, paid = green). Clicking "Mark as Paid" on any bill opens a modal pre-filled with the template amount; the user may override it and add a note. After confirming, the row turns green with the actual paid amount and date, and the next period's instance is auto-generated and visible when the user navigates to that month. A year-month selector (previous year + current year, current month highlighted) allows reviewing past payments.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Auto-generation trigger | Side-effectful GET (server-side, current month only) | Transparent to frontend — one request, no extra roundtrip; idempotency constraint makes it safe |
| Overdue computation | Dynamic in response (no DB write) | Always accurate without a background job; DB status lags but is never read for filtering |
| Page location | New `/dashboard/payments` + nav item | Clean separation: Bills owns templates, Payments owns instances |
| Mark-as-paid UX | Modal dialog (ArchiveConfirmDialog pattern) | Consistent with existing codebase; prevents accidental clicks; FR-008 requires amount override |
| Month navigation | Year-based selector (prev year + current year, current month default) | Lets users review last year without complex pagination; simpler than a date picker |
| Row fields | Name, amount, currency, due date, status badge; paid amount + date for paid rows | Shows the essential audit trail without clutter |
| Empty state | Friendly message + link to Bills page | Guides new users with no templates; recoverable dead-end |
| i18n scope | All 3 locales (en/pl/de) | de is an active locale — missing keys cause next-intl runtime errors |

## Scope

**In scope:**
- `ensure_current_period_instances` service function (current month only)
- Dynamic overdue status in `GET /bills/payments` response
- `bill_name` + `currency` added to `PaymentInstanceOut` (both endpoints)
- New `/dashboard/payments` page with year-month selector
- `PaymentRow` component (read view + mark-paid button)
- `MarkPaidDialog` component (amount override, notes)
- "Payments" nav item in dashboard layout
- i18n keys in en/pl/de for all new UI

**Out of scope:**
- Email reminders (FR-012, parked)
- Payment deletion / undo paid
- Auto-generation for past months
- Statistics or totals on the payments page
- Category filter on the payments page

## Architecture / Approach

The backend list endpoint (`GET /bills/payments`) grows two responsibilities: on current-month requests, it calls `ensure_current_period_instances(db, month)` before querying (seeds any missing instances); after querying, it overrides status to `overdue` for any instance whose `due_date < today` and stored status is `upcoming`. Both behaviors are additive — no existing tests or endpoints break. The frontend is entirely new: a dedicated page, a reusable `PaymentRow`, and a `MarkPaidDialog` modeled on the existing `ArchiveConfirmDialog` pattern. After a successful mark-paid, the page updates the local instance list in place (no re-fetch) — the next-period instance appears when the user navigates to the appropriate future month.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend Enhancement | Seeded current-month instances, dynamic overdue, bill_name/currency in response | `ensure_current_period_instances` must guard against seeding past months and handle archived/paused/one-off templates correctly |
| 2. Payments Page (Read) | Year-month selector, payment list, status badges, nav item, 3-locale i18n | Year-month selector layout and month abbreviation formatting (use `Intl.DateTimeFormat` to avoid 12 hardcoded string keys per locale) |
| 3. Mark as Paid | Modal dialog, write path, post-payment list update, loop verified | `onPaid` callback replaces instance in local state — next-period instance is not visible until user navigates to the future month (intentional) |

**Prerequisites:** S-01 (auth-ui) ✓ done, S-02 (bill-template-management) ✓ done, at least one active bill template in the DB for manual testing
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- The `ensure_current_period_instances` guard (current month only) assumes users don't need retroactive instance generation for past months when they first set up the app — acceptable for household use but worth monitoring
- `Intl.DateTimeFormat` month abbreviations depend on the locale context being correct at render time; if the year-month selector renders before the locale loads, it may flash English month names briefly
- The `(bill_id, period)` unique constraint is the idempotency backstop — the ensure function must handle `IntegrityError` gracefully (e.g., catch and ignore) rather than pre-checking existence

## Success Criteria (Summary)

- User creates a bill template, visits `/dashboard/payments`, and sees the current month's instance without any manual generation step
- Marking a monthly bill as paid (with amount override) causes the row to turn green with the actual paid amount, and the next month's instance appears in the next-month view
- All UI text renders correctly in English, Polish, and German with no next-intl runtime errors
