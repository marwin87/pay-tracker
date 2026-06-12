# Core Payment Tracking Loop — Implementation Plan

## Overview

Build S-03 (the roadmap north star): a `/dashboard/payments` page where users view all payment instances for a selected month, mark bills as paid with an optional amount override, and watch the next period's instance appear automatically — satisfying US-01 end-to-end (FR-006, FR-007, FR-008, FR-009).

The backend routing and recurrence mechanics exist but need two enhancements: (1) auto-seeding the current month's instances on page load, and (2) computing overdue status dynamically at response time. All frontend work is new — zero payment instance UI exists today.

## Current State Analysis

**Backend — largely done:**
- `GET /bills/payments?month=YYYY-MM` lists instances from DB; sorted by due_date (`backend/app/routers/bills.py:51-60`)
- `POST /bills/payments/{instance_id}/pay` marks paid + calls `generate_next_instance` (`bills.py:63-87`)
- `generate_next_instance` in `backend/app/services/recurrence.py:34-65` is idempotent via the `(bill_id, period)` DB unique constraint (`payment_instances.uq_payment_instance_bill_period`)
- `PaymentInstanceOut` schema (`backend/app/schemas/bill.py:45-57`) has no `bill_name` or `currency` — frontend cannot display the bill's name or currency without a separate templates fetch

**Two backend gaps:**
- No `ensure_current_period_instances` function — visiting the payments page for the first time in a month produces an empty list even when active templates exist (FR-006 not wired to the list endpoint)
- `PaymentStatus.upcoming` is never transitioned to `overdue` in the DB — overdue detection must be computed dynamically at response time

**Frontend — nothing exists:**
- No payments API client (no `fetchPayments`, no `markPaid` in `frontend/src/lib/`)
- No `/dashboard/payments` page or route
- No payment-related components
- No `PaymentsPage` or `MarkPaidDialog` translation keys in the three locale files (`frontend/messages/en.json`, `pl.json`, `de.json`)
- No "Payments" entry in the dashboard nav (`frontend/src/app/dashboard/layout.tsx:12-14`)

## Desired End State

A user with existing bill templates opens `/dashboard/payments`, sees the current month's instances seeded automatically (if not already present), sorted by due date, with color-coded status badges (upcoming = blue, overdue = red, paid = green). Each row shows: bill name, amount + currency, due date, status badge, and — for paid instances — the actual paid amount and paid date. Clicking "Mark as Paid" on any non-paid instance opens a modal pre-filled with the template amount; the user may override the amount and add a note before confirming. After confirmation, the instance turns paid, and — unless the template is paused — the next period's instance appears automatically in the appropriate month. The month selector displays all months of the current and previous year; the current month is selected by default.

### Key Discoveries

- `recurrence.py:_due_date_for_period` (line 26-32) already clamps due_day to last day of month — reuse it in `ensure_current_period_instances`
- `generate_next_instance` (line 34-65) handles idempotency and one_off guard — the new ensure function should share the same guard logic (skip archived, skip paused, skip one_off) but target an explicit period rather than the "next" one
- The `(bill_id, period)` unique constraint is the idempotency backstop — `ensure_current_period_instances` can safely fire on every GET without fear of duplicates
- `PaymentInstanceOut` is returned by both `list_payments` and `mark_paid`; adding `bill_name` and `currency` must be propagated to both endpoints
- The ArchiveConfirmDialog pattern (`frontend/src/components/bills/ArchiveConfirmDialog.tsx`) is the template for MarkPaidDialog — reuse its modal structure (backdrop, dialog box, form, confirm/cancel buttons)
- `BillTemplateRow` inline-edit pattern (`frontend/src/components/bills/BillTemplateRow.tsx`) shows how the codebase handles state and optimistic UI refresh — payments page should follow the same fetch-on-change pattern
- All 3 locale files must be updated; missing keys cause runtime errors in next-intl

## What We're NOT Doing

- No background job for overdue detection — dynamic computation at response time is sufficient for MVP
- No auto-generation for past months — only the current month is seeded on GET; navigating to past months shows what's in the DB
- No auto-generation for future months — the mark-paid cascade handles future month seeding
- No email reminders (FR-012, nice-to-have, parked in roadmap)
- No payment deletion — instances can be marked paid; no "undo paid" in v1
- No statistics, charts, or summary totals on the payments page
- No category filter on the payments page — filtering deferred to v2

## Implementation Approach

Three phases, back-to-front:

1. **Backend** — Extend `PaymentInstanceOut` with `bill_name` + `currency`; add `ensure_current_period_instances` service function; update the list endpoint to auto-seed and compute overdue dynamically; update `mark_paid` to also populate the new fields.
2. **Payments page (read view)** — API client (`payments-api.ts`), new `/dashboard/payments` page with year-month selector, `PaymentRow` component, i18n keys (3 locales), nav item.
3. **Mark as Paid (write path)** — `MarkPaidDialog` component wired into `PaymentRow`; post-payment list refresh; remaining i18n keys for the dialog.

## Critical Implementation Details

**Auto-generation guard:** `ensure_current_period_instances` must only be called when the requested month equals the current calendar month. For past months, show DB state as-is. This guard prevents seeding stale overdue instances retroactively for every month since a template was created.

**Dynamic overdue computation:** After fetching instances from DB, loop through the result set and, for any instance where `due_date < date.today()` and the stored status is `upcoming`, override `status` to `overdue` in the serialized response — do NOT commit this change to the DB. The cleanest implementation is to serialize to a dict and mutate the status field before returning; do not assign to the ORM object's attribute (SQLAlchemy may flush the change).

**`bill_name` and `currency` join:** Both `list_payments` and `mark_paid` must eagerly load the `template` relationship (or query-join) and populate `bill_name`/`currency` before returning. FastAPI's `response_model` will validate the output — the schema fields must exist in the returned data.

---

## Phase 1: Backend Enhancement

### Overview

Extend the payment API response with bill identity fields, add a service function to seed current-month instances, and make the list endpoint compute overdue status dynamically.

### Changes Required

#### 1. Extend PaymentInstanceOut schema

**File:** `backend/app/schemas/bill.py`

**Intent:** Add `bill_name: str` and `currency: str` to `PaymentInstanceOut` so the frontend can render the bill's name and currency in the payment list without a second API call.

**Contract:** Two new required fields appended to `PaymentInstanceOut`: `bill_name: str` (the associated template's name) and `currency: str` (the associated template's currency, e.g., "PLN"). Both fields are read-only — populated from the template relationship, not accepted as input.

#### 2. Add ensure_current_period_instances to recurrence service

**File:** `backend/app/services/recurrence.py`

**Intent:** Add a new public function `ensure_current_period_instances(db, period)` that, for each active (not archived), non-paused, non-one-off template, creates a payment instance for `period` if one doesn't already exist. This satisfies FR-006 (idempotent auto-generation) wired to page load.

**Contract:** `ensure_current_period_instances(db: Session, period: str) -> None` — `period` is a "YYYY-MM" string. For each qualifying template, compute `due_date` using the existing `_due_date_for_period` helper and insert a `PaymentInstance(status=upcoming)`. Rely on the `uq_payment_instance_bill_period` unique constraint for idempotency — catch `IntegrityError` (or use `INSERT ... ON CONFLICT DO NOTHING` via an explicit merge) rather than pre-checking existence. Do not call `generate_next_instance` here — that function targets the *next* period after a paid one; this function targets an *explicit* period for initial seeding.

#### 3. Update list_payments endpoint

**File:** `backend/app/routers/bills.py`

**Intent:** Make the GET `/bills/payments` endpoint (a) default to the current month when no `month` is specified, (b) auto-seed current-month instances before returning, and (c) compute overdue status dynamically in the response. Also eagerly load the template relationship to populate `bill_name` and `currency`.

**Contract:** Three behavioral changes to the `list_payments` function:
- Default `month` to `date.today().strftime("%Y-%m")` when the caller omits it
- Call `ensure_current_period_instances(db, month)` only when `month == current_month` — skip for past or future months
- After fetching, construct the response as a list of dicts: for each instance, serialize to `PaymentInstanceOut`, add `bill_name=instance.template.name` and `currency=instance.template.currency`, and override `status` to `PaymentStatus.overdue` if `instance.due_date < date.today()` and the stored status is `upcoming`. Return `response_model=list[PaymentInstanceOut]` with these dicts.

#### 4. Update mark_paid endpoint

**File:** `backend/app/routers/bills.py`

**Intent:** The `mark_paid` response must now include `bill_name` and `currency` to match the updated `PaymentInstanceOut` schema.

**Contract:** After `db.refresh(instance)`, construct and return a dict identical to the pattern in `list_payments`: `PaymentInstanceOut.model_validate(instance).model_dump() | {"bill_name": instance.template.name, "currency": instance.template.currency}`. The status override logic is not needed here (status will be `paid` at this point).

### Success Criteria

#### Automated Verification

- `cd backend && uv run uvicorn app.main:app --reload` starts without import errors
- `GET /bills/payments` with no month param returns HTTP 200 and instances seeded for the current month (after at least one active template exists)
- `GET /bills/payments?month=2026-01` returns existing instances without seeding (no new DB writes for past months)
- A past-due instance appears with `status: "overdue"` in the response even though its DB status is `upcoming`
- `POST /bills/payments/{id}/pay` response body includes `bill_name` and `currency` fields
- `cd backend && uv run python -m pytest` (if any tests exist) passes

#### Manual Verification

- Create a bill template (monthly, due day 1), then call `GET /bills/payments` via API docs (`http://localhost:8010/docs`) — instance for current month appears automatically
- Instance for a past due date returns `status: "overdue"` in the response
- Mark an instance paid — response includes `bill_name` and `currency` correctly

**Implementation Note:** Pause here after manual verification before moving to Phase 2.

---

## Phase 2: Payments Page (Read View)

### Overview

Build the frontend read path: an API client, a new `/dashboard/payments` page with a year-month selector, a `PaymentRow` component, navigation entry, and all i18n keys for the read view (3 locales).

### Changes Required

#### 1. Payments API client

**File:** `frontend/src/lib/payments-api.ts` (new)

**Intent:** Centralize all payment instance API calls, mirroring the `bills-api.ts` pattern.

**Contract:** Export two functions and one type:
- `PaymentInstanceOut` interface matching the backend schema (including `bill_name: string`, `currency: string`, `status: "upcoming" | "overdue" | "paid"`, `paid_amount: number | null`, `paid_at: string | null`)
- `fetchPayments(month: string): Promise<PaymentInstanceOut[]>` — `GET /bills/payments?month={month}` via `apiFetch`
- `markPaid(instanceId: number, paidAmount: number, notes?: string): Promise<PaymentInstanceOut>` — `POST /bills/payments/{instanceId}/pay` with body `{ paid_amount: paidAmount, notes }` via `apiFetch`

#### 2. Payments page

**File:** `frontend/src/app/dashboard/payments/page.tsx` (new)

**Intent:** Render the year-month selector and the payment list for the selected month; auto-fetch when the selected month changes.

**Contract:** A client component with:
- State: `selectedMonth: string` (initialized to current month as `"YYYY-MM"`)
- Year-month selector layout: for each of the two years (current year and previous year), render the year as a heading followed by a row of 12 month buttons (Jan–Dec). The currently selected month button is highlighted. Clicking a month button updates `selectedMonth` and triggers a re-fetch.
- Fetch `fetchPayments(selectedMonth)` on mount and on `selectedMonth` change; show loading skeleton during fetch and an error banner on failure
- Render a list of `PaymentRow` components for each instance, sorted by due_date (the backend already sorts)
- Empty state: when the fetched list is empty, show a friendly message (i18n key `PaymentsPage.noPayments`) with a link to `/dashboard/bills`

#### 3. PaymentRow component

**File:** `frontend/src/components/payments/PaymentRow.tsx` (new)

**Intent:** Render a single payment instance as a list row with bill identity, due date, status, and — for paid instances — actual paid amount and date. Non-paid instances get a "Mark as Paid" button (wired in Phase 3).

**Contract:** Props: `instance: PaymentInstanceOut`, `onPaid: (updated: PaymentInstanceOut) => void` (Phase 3 wires this). Display fields:
- Bill name (bold)
- Amount + currency (e.g., `120.00 PLN`)
- Due date (formatted day of month + month name, e.g., "15 Jun")
- Status badge: `upcoming` → blue, `overdue` → red, `paid` → green; label from i18n
- For `status === "paid"`: show `paid_amount + currency` and `paid_at` date (formatted "DD MMM")
- "Mark as Paid" button visible only when `status !== "paid"`; clicking it is wired in Phase 3 (placeholder `onClick` for now)
- Follow existing Tailwind + dark-mode class conventions from `BillTemplateRow.tsx`

#### 4. Add "Payments" to dashboard nav

**File:** `frontend/src/app/dashboard/layout.tsx`

**Intent:** Add a "Payments" navigation link so users can reach the new page.

**Contract:** Add a new entry to the `NAV_ITEMS` array (line 12-14): `{ href: "/dashboard/payments", labelKey: "DashboardLayout.payments" }` (or equivalent to the existing nav item shape). The translation key `DashboardLayout.payments` must be added to all 3 locale files.

#### 5. i18n keys — read view

**Files:** `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent:** Add all translation keys needed for the payments page and row (read view only; dialog keys are added in Phase 3).

**Contract:** Add a `PaymentsPage` section and a `PaymentRow` section to each locale file. Minimum keys required:

`PaymentsPage`:
- `title` — page heading ("Payments")
- `noPayments` — empty state message ("No bills for this month")
- `addBills` — link label ("Add bills →")
- `loadError` — fetch error message
- Month abbreviations or a `months` subkey (Jan–Dec) for the year-month selector buttons, unless you use `Intl.DateTimeFormat` formatting directly (preferred — no hardcoded strings)

`PaymentRow`:
- `status.upcoming`, `status.overdue`, `status.paid` — badge labels
- `markAsPaid` — button label
- `paidOn` — label prefix for paid date ("Paid on")

`DashboardLayout`:
- `payments` — nav label ("Payments")

Use `Intl.DateTimeFormat` for month abbreviations in the year-month selector to avoid adding 12 keys per locale.

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes with no new errors
- `cd frontend && npm run build` (or type-check command) completes without TypeScript errors
- All 3 locale files contain the new keys; no key is missing

#### Manual Verification

- Navigating to `/dashboard/payments` shows the current month's instances (seeded by Phase 1)
- Year-month selector shows two years (current + previous); current month is highlighted; clicking a different month updates the list
- Each row shows bill name, amount + currency, due date, and status badge with correct color
- Paid instances show paid amount + paid date
- Empty state with link to Bills page appears when the selected month has no instances
- "Payments" appears in the dashboard nav bar and routes correctly
- German UI (LanguageToggle → DE) shows no missing key errors in the browser console

**Implementation Note:** Pause here for manual verification before Phase 3.

---

## Phase 3: Mark as Paid (Complete the Loop)

### Overview

Add the write path: `MarkPaidDialog` component wired into `PaymentRow`, list refresh after payment, and the remaining i18n keys for the dialog. After this phase the full US-01 loop is verifiable end-to-end.

### Changes Required

#### 1. MarkPaidDialog component

**File:** `frontend/src/components/payments/MarkPaidDialog.tsx` (new)

**Intent:** A modal dialog (following `ArchiveConfirmDialog.tsx` structure) that lets the user confirm or override the payment amount before marking a bill as paid.

**Contract:** Props: `instance: PaymentInstanceOut`, `isOpen: boolean`, `onClose: () => void`, `onConfirm: (updated: PaymentInstanceOut) => void`. Internal state: `paidAmount: string` (initialized from `instance.amount`), `notes: string` (empty), `isSubmitting: boolean`, `error: string | null`. On submit: call `markPaid(instance.id, parseFloat(paidAmount), notes)`, call `onConfirm(result)` on success, show error string on failure. Modal structure: backdrop blur overlay, white/dark card, bill name in title, amount input (type="number", step="0.01", min="0.01"), optional notes textarea, Cancel + "Mark as Paid" confirm buttons (confirm disabled while `isSubmitting`).

#### 2. Wire MarkPaidDialog into PaymentRow and payments page

**File:** `frontend/src/components/payments/PaymentRow.tsx`

**Intent:** Connect the "Mark as Paid" button to the dialog; pass through the `onPaid` callback to update the parent's instance list after a successful payment.

**Contract:** Add state `isDialogOpen: boolean` (default false). "Mark as Paid" button sets `isDialogOpen = true`. Render `<MarkPaidDialog>` with the row's instance, `isOpen={isDialogOpen}`, `onClose={() => setIsDialogOpen(false)}`, and `onConfirm={(updated) => { setIsDialogOpen(false); onPaid(updated); }}`.

**File:** `frontend/src/app/dashboard/payments/page.tsx`

**Intent:** Handle the `onPaid` callback from `PaymentRow` to update the displayed instance list without a full re-fetch.

**Contract:** When `onPaid(updated)` fires, replace the matching instance in the local state list (by `id`) with `updated`. This produces an immediate status change from upcoming/overdue → paid and surfaces the updated `paid_amount`/`paid_at`. No full re-fetch needed — the next-period instance (if generated) will only appear when the user navigates to the relevant future month, which is acceptable behavior.

#### 3. i18n keys — dialog

**Files:** `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent:** Add translation keys for the MarkPaidDialog.

**Contract:** Add a `MarkPaidDialog` section to each locale file. Minimum keys:
- `title` — dialog heading (e.g., "Mark as Paid: {billName}")
- `amountLabel` — input label ("Amount paid")
- `notesLabel` — notes field label ("Notes (optional)")
- `cancel` — cancel button
- `confirm` — confirm button ("Mark as Paid")
- `confirming` — loading state ("Marking…")
- `saveFailed` — generic error message

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes with no new errors
- `cd frontend && npm run build` completes without TypeScript errors
- All 3 locale files contain the `MarkPaidDialog` keys

#### Manual Verification

- Clicking "Mark as Paid" on an upcoming or overdue instance opens the dialog pre-filled with the template amount
- User can change the amount and add a note; submitting calls the API and the row updates to "paid" status showing the actual paid amount and today's date
- Clicking "Mark as Paid" on a second bill from the same template in a future month confirms the next-period instance was auto-generated (navigate to next month to verify)
- Marking a paused template's instance as paid does NOT generate a next-period instance (verify by checking next month is empty for that bill)
- Marking a one-off template's instance as paid does NOT generate a next-period instance
- Dialog closes cleanly on Cancel without any state leak
- German UI shows all dialog strings correctly (no missing key errors)
- No regressions: Bill templates page still loads and functions correctly

**Implementation Note:** After all manual verification passes, the US-01 core loop is complete. Stage files, share the proposed commit message, and await user approval.

---

## Testing Strategy

### Manual Testing Steps

1. Create 3 bill templates: (a) monthly, due day 15, €100 electricity; (b) quarterly, due day 1, PLN 500 rent; (c) one-off, PLN 50 repair
2. Navigate to `/dashboard/payments` — verify current month's instances appear for all 3 templates automatically
3. Verify electricity instance shows `upcoming` (blue) if due date is in the future, or `overdue` (red) if due date has passed
4. Mark electricity as paid with the default €100 — row turns green with paid amount and date; navigate to next month and verify next monthly instance appears
5. Mark rent as paid — verify next quarterly instance appears in the correct future month (not next month if the quarter hasn't elapsed)
6. Mark the one-off repair as paid — verify no new instance is created for the following month
7. Pause the electricity template, then mark the current paid instance as paid (if a second one exists) — verify no next instance is created
8. Navigate to the previous year December — list shows DB state (no seeding, no error)
9. Switch UI language to Polish and then German — all payments page text renders correctly in both languages

## Performance Considerations

The `ensure_current_period_instances` function runs one query per active template per GET request. For a household with ~20 bills, this is negligible. No optimization needed for MVP.

## References

- PRD user story: `context/foundation/prd.md` §User Stories US-01
- Roadmap entry: `context/foundation/roadmap.md` S-03
- Recurrence service: `backend/app/services/recurrence.py`
- Bills router (payment endpoints): `backend/app/routers/bills.py:51-87`
- Archive dialog pattern: `frontend/src/components/bills/ArchiveConfirmDialog.tsx`
- Bills API client pattern: `frontend/src/lib/bills-api.ts`
- i18n locale files: `frontend/messages/{en,pl,de}.json`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend Enhancement

#### Automated

- [x] 1.1 Backend starts without import errors after schema + service changes
- [x] 1.2 GET /bills/payments returns seeded instances for current month
- [x] 1.3 GET /bills/payments?month=past-month returns DB state, no seeding
- [x] 1.4 Past-due instance returns status overdue in response
- [x] 1.5 POST /bills/payments/{id}/pay response includes bill_name and currency

#### Manual

- [x] 1.6 API docs (/docs) confirm GET auto-seeds instance for a new template
- [x] 1.7 Past due date instance shows overdue in response
- [x] 1.8 mark_paid response includes correct bill_name and currency

### Phase 2: Payments Page (Read View)

#### Automated

- [x] 2.1 npm run lint passes with no new errors
- [x] 2.2 npm run build completes without TypeScript errors
- [x] 2.3 All 3 locale files contain PaymentsPage, PaymentRow, DashboardLayout.payments keys

#### Manual

- [x] 2.4 /dashboard/payments shows current month instances
- [x] 2.5 Year-month selector shows two years; current month highlighted; clicking changes list
- [x] 2.6 Rows show bill name, amount + currency, due date, status badge with correct color
- [x] 2.7 Paid instances show paid amount and paid date
- [x] 2.8 Empty state with Bills link appears when month has no instances
- [x] 2.9 Payments nav item visible and routes correctly
- [x] 2.10 German UI shows no missing key console errors

### Phase 3: Mark as Paid (Complete the Loop)

#### Automated

- [x] 3.1 npm run lint passes with no new errors
- [x] 3.2 npm run build completes without TypeScript errors
- [x] 3.3 All 3 locale files contain MarkPaidDialog keys

#### Manual

- [x] 3.4 Mark as Paid dialog opens pre-filled with template amount
- [x] 3.5 Amount override works; row updates to paid on confirm
- [x] 3.6 Next-period instance appears for monthly bill after marking paid
- [x] 3.7 Paused template: marking paid does NOT generate next instance
- [x] 3.8 One-off template: marking paid does NOT generate next instance
- [x] 3.9 Dialog closes cleanly on Cancel
- [x] 3.10 German UI shows all dialog strings correctly
- [x] 3.11 Bill templates page has no regressions
