# .xlsx Export — Plan Brief

> Full plan: `context/changes/xlsx-export/plan.md`

## What & Why

Users need a one-click way to export their payment history as a spreadsheet — the format Pay Tracker is designed to replace. FR-010 requires an `.xlsx` export; the backend endpoint already exists but produces a flat single-sheet file that lacks a year scope, monthly structure, and currency information.

## Starting Point

`GET /export/xlsx` is fully wired (authenticated, pandas + openpyxl in deps) but returns all instances in a single sheet with no year filter. The Currency and Category columns are missing. The frontend has no export button or API wrapper.

## Desired End State

The Payments page has an "Export .xlsx" button. Clicking it downloads `pay-tracker-<year>.xlsx` — a 12-sheet workbook (Jan–Dec for the current year) with columns: Bill, Category, Period, Due Date, Amount, Currency, Status, Paid Amount, Paid At, Notes. Empty months produce a header-only sheet. The button disables with a spinner during the fetch; failure shows an inline error.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Button placement | Payments page header | Contextually obvious — user is looking at payment history when they want to export | Plan |
| Year scope | Always current calendar year | Zero UI for year selection; single button covers the common case | Plan |
| Sheet structure | 12 tabs (Jan–Dec) | Mirrors the household spreadsheet being replaced; familiar tab-per-month layout | Plan |
| Currency column | Add it | Amounts are ambiguous without currency — `template.currency` is already loaded | Plan |
| Download mechanism | Programmatic blob fetch | `apiFetch` is JSON-only; blob download requires a separate `fetch` → `res.blob()` path | Plan |
| Error UX | Inline error below button | Matches existing `loadError` banner pattern; no new toast infrastructure | Plan |
| Loading UX | Button disabled + spinner | Matches `MarkPaidDialog` / `ArchiveConfirmDialog` pattern already in the codebase | Plan |

## Scope

**In scope:**
- Backend: year query param, monthly grouping (12 sheets), Category + Currency columns
- Frontend: `export-api.ts` utility, Export button with loading/error state on Payments page
- i18n: EN, PL, DE translation keys for three new strings

**Out of scope:**
- Year picker UI (always current year)
- JSON backup button (separate slice S-08)
- New npm dependencies
- DB schema changes

## Architecture / Approach

Backend receives `?year=<int>` (defaults to current year via `Query(default_factory=...)`) and writes 12 worksheets using `calendar.month_abbr` for sheet names. Frontend's `downloadXlsx(year)` function does a raw `fetch` with the JWT header, reads `res.blob()`, creates a temporary object URL, and clicks a hidden `<a>` — bypassing `apiFetch` which only handles JSON.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend update | Year-scoped 12-sheet xlsx with Category + Currency | Minimal — endpoint already works; changes are additive |
| 2. Frontend button | Download utility + Payments page button + i18n (3 langs) | `apiFetch` can't handle blobs — must use separate fetch path |

**Prerequisites:** Docker Compose stack running (`docker compose up --build`)
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- German translations are approximated; native speaker should review `de.json` if the app is used by German speakers.
- Empty months (no payment instances in that month/year) produce header-only sheets — this is intentional and matches a clean spreadsheet structure.

## Success Criteria (Summary)

- Clicking Export on the Payments page downloads a valid `.xlsx` file.
- The file contains 12 named monthly sheets with the correct 10 columns including Currency.
- Button correctly reflects loading state and surfaces errors without crashing the page.
