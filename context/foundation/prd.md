---
project: pay-tracker
version: 1
status: draft
created: 2026-06-11
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 7
  hard_deadline: null
  after_hours_only: true
---

# Pay Tracker — Product Requirements Document

## Vision & Problem Statement

Managing household bills and recurring payments in a spreadsheet is tedious and
error-prone. The pain combines three compounding problems: too many manual steps
(updating the sheet each month, creating next-month rows by hand), missing capability (no
reminders, no automation, no shared real-time view), and coordination overhead — family
members cannot see or update the same payment list without emailing the file back and
forth.

The insight: existing tools (YNAB, Mint, and similar) are subscription-based and
over-engineered for simple household bill tracking. They also depend on third-party cloud
services, offering no path to self-hosted or offline operation. A personal-first bill
tracker that works identically whether hosted in the cloud or on a home server — with no
third-party subscription, no data sharing with outside services, and no unnecessary
complexity — does not exist as an off-the-shelf product.

## User & Persona

**Primary persona:** A household finance manager — typically the one person (or couple)
responsible for tracking all recurring household bills. This person currently maintains
bills in a spreadsheet, manually updates it each month, and relies on their own memory for
reminders. They want a web app that replaces the spreadsheet with automation, while keeping
data under their control (either self-hosted or privately cloud-hosted).

**Secondary persona:** Other family members who can view the unified payment list and mark
individual bills as paid, but who do not own template creation or system maintenance.

## Success Criteria

### Primary

The core bill-tracking loop works end-to-end:

Given a user has created a bill template (e.g., "Electricity — due 15th, monthly, €120"),
when they mark this month's payment instance as paid (accepting the default amount of €120
or overriding with the actual amount paid), then the system automatically generates next
month's instance and it appears on the dashboard — with no manual intervention required.

Validated in both deployment modes (local self-hosted first, cloud-hosted second).

### Secondary

The system sends email reminders for payments that are upcoming or overdue, so the
household finance manager does not need to check the dashboard proactively.

### Guardrails

1. **No data loss.** Payment history is never silently corrupted or deleted. Exports and
   backups produce accurate, complete data at any point in time.
2. **Auth secure in both modes.** No unauthenticated access to any finance data in either
   local or cloud deployment.
3. **Both deployment modes operate end-to-end.** Local self-hosted and cloud-hosted modes
   both work in v1. Local ships first; cloud follows in the same sprint.

## User Stories

### US-01: Core bill-tracking loop

- **Given** I have created a bill template (e.g., "Electricity — due 15th, monthly, €120")
- **When** I mark this month's payment instance as paid, accepting the default amount of
  €120 or overriding it with the actual amount paid
- **Then** the system automatically generates next month's instance and it appears on the
  dashboard — and the current instance's status changes to "paid" — with no manual action
  required

## Functional Requirements

### Authentication

- FR-001: User can register with email and password. Priority: must-have
  > Socratic: No counter-argument — registration is essential for family access; no simpler
  > onboarding path meets the multi-user requirement.

- FR-002: User can log in with email and password. Priority: must-have
  > Socratic: No counter-argument — authentication is foundational; cannot be deferred.

### Bill Templates

- FR-003: User can create a bill template with name, amount, currency, category, due day of month,
  recurrence type, and paused flag. Priority: must-have
  > Currency is a per-template string (PLN / EUR / USD / custom); default is PLN.
  > Socratic: Category kept as must-have — needed for export reporting and filtering.

- FR-004: User can edit an existing bill template. Priority: must-have
  > Socratic: No counter-argument — template values (amount, due day) change over time.

- FR-005: User can archive a bill template (hidden from active view; existing payment
  history preserved). Priority: must-have
  > Socratic: Archive preferred over hard delete — prevents accidental financial history
  > loss. Archived templates' instances remain accessible via export.

### Payment Instances

- FR-006: System auto-generates a payment instance from a template for the current period;
  generation is idempotent (requesting the same instance twice produces one record).
  Priority: must-have
  > Socratic: No counter-argument — idempotent generation prevents duplicate records at
  > month boundaries.

- FR-007: User can view a unified payment list sorted by due date with status indicators
  (upcoming / overdue / paid). Priority: must-have
  > Socratic: Unified list chosen over separate upcoming/overdue views — simpler to build;
  > status indicators make overdue items visible. Separate filtered views deferred to v2.

- FR-008: User can mark a payment instance as paid; the recorded amount defaults to the
  template amount with an option to override before confirming. Priority: must-have
  > Socratic: Defaulting to template amount reduces friction for the common case where
  > actual equals expected; override is available for variable bills (e.g., utilities).

- FR-009: System auto-creates the next-period payment instance when the current one is
  marked as paid; auto-creation is suppressed when the template's paused flag is set.
  Priority: must-have
  > Socratic: Pause flag at template level allows stopping recurrence without deleting the
  > template or losing its payment history.

### Export & Backup

- FR-010: User can export payment data to a spreadsheet file (.xlsx). Priority: must-have
  > Socratic: Both export and backup are must-have — spreadsheet export serves family
  > review; data backup enables portability between deployment modes.

- FR-011: User can download a full data backup in a portable machine-readable format.
  Priority: must-have
  > Socratic: Backup and spreadsheet export serve distinct purposes; both justified for v1.

### Reminders

- FR-012: System sends email reminders for upcoming and overdue payments.
  Priority: nice-to-have
  > Socratic: Scoped to email-only delivery — browser push notifications deferred due to
  > implementation complexity. Email works in both deployment modes with appropriate mail
  > provider configuration.

### PWA

- FR-013: App is installable as a PWA on mobile and desktop in both deployment modes.
  Priority: must-have
  > Socratic: PWA requirement kept for both modes — portability is the core value. Local
  > operators are expected to configure HTTPS; guidance deferred to deployment docs.

### Deployment Modes

- FR-014: App runs in cloud-hosted mode with no code changes required vs. local mode.
  Priority: must-have
  > Socratic: Both modes ship in v1. Local ships first; cloud follows in the same sprint.
  > Shipping cloud-only would contradict the portability value proposition.

- FR-015: App runs in self-hosted local mode with no code changes required vs. cloud mode.
  Priority: must-have
  > Socratic: Local-first sequencing reduces cloud-provider dependency risk during initial
  > development.

## Non-Functional Requirements

- **Data persistence:** All payment data is retained durably. The user's payment history
  survives app restarts and redeployments without data loss.

- **Mobile usability:** The app layout is fully operable on screens as narrow as 375px
  without requiring pinch-zoom. Family members check bills on phones; the primary view
  must work on a standard mobile screen.

## Business Logic

Pay Tracker automatically derives the status of each payment and creates the next recurring
instance without user intervention: given a bill's due date and whether it has been marked
paid, the system classifies the instance as upcoming, overdue, or paid — and when a
recurring instance is marked paid, the system produces the next period's instance from the
bill's recurrence schedule, without any additional user action.

Two distinct rules compose this behavior:

1. **Status classification:** Given today's date, a payment instance's due date, and
   whether it has been marked paid, the system assigns one of three statuses: `upcoming`
   (due date is in the future and unpaid), `overdue` (due date has passed and unpaid), or
   `paid`. This classification drives the dashboard display and email reminder triggers.

2. **Recurrence automation:** Given a bill template's recurrence schedule (its frequency
   and scheduled due day within the month) and a payment instance that has been marked
   paid, the system derives the next period's due date and creates a new instance for that
   period — unless the template's paused flag is set. The output is a new payment instance
   ready to appear on the dashboard with `upcoming` status. Auto-creation does not occur
   for one-time (non-recurring) bills or for templates with the paused flag set.

## Access Control

All users authenticate before accessing any finance data.

Authentication method: email and password.

Role model: flat — all authenticated users share the same household view. There are no
ownership tiers or permission differences between accounts. Any authenticated user can
create templates, mark payments, and access exports.

Self-registration is supported so family members can join without requiring an invitation
from another user. Registration is intentionally open to anyone who knows the app's URL —
appropriate for a privately deployed household tool where URL distribution is controlled
by the household.

## Non-Goals

- **No budgeting or savings goals.** Pay Tracker tracks bills and payments only; it does
  not advise on budget allocation, savings targets, or financial planning.

- **No bank or card integrations.** No automatic transaction import of any kind (no open
  banking, no statement parsing). All data is entered manually by the user.

- **No multi-household or SaaS mode.** One household per deployment instance. No public
  sign-up, no per-user billing, no tenant isolation. Personal-first, not platform-first.

- **No native mobile app.** PWA is the mobile story. No app store distribution, no
  platform-specific build.

## Open Questions

1. **Local-mode PWA and HTTPS.** A self-hosted deployment without HTTPS cannot install
   as a PWA on most browsers. A reverse-proxy or certificate setup guide is needed in
   deployment documentation. — Owner: implementation team. Block: no (does not affect core
   functionality; deferred to deployment docs).

2. **Email delivery configuration (FR-012).** The mail provider, credentials, and
   configuration format for email reminders are deployment concerns, not product concerns.
   These must be documented in deployment guides for both local and cloud modes. — Owner:
   implementation team. Block: no (FR-012 is nice-to-have; deferred to deployment docs).
