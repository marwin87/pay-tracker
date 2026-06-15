# .xlsx Export Implementation Plan

## Overview

Add a one-click `.xlsx` download to the Payments page that exports the current year's payment history as a 12-sheet workbook (one sheet per month, Jan–Dec). The backend endpoint already exists but needs to be updated to support year-scoped filtering, monthly grouping, and a missing Currency column. The frontend needs an auth-aware download utility and a button with loading/error feedback.

## Current State Analysis

**Backend (`backend/app/routers/export.py`):**
- `GET /export/xlsx` is fully wired (authenticated, streaming, openpyxl + pandas in deps).
- Currently exports **all** payment instances in a single flat sheet, no year filter, no monthly grouping.
- Missing `Currency` column — `template.currency` is not included despite the model carrying it.

**Frontend:**
- No export API wrapper exists in `frontend/src/lib/`.
- No export button anywhere in the UI.
- `apiFetch` (`frontend/src/lib/api.ts`) is JSON-only (`res.text()` → `JSON.parse`); blob downloads require a separate fetch path.
- i18n keys for export are absent from EN, PL, and DE message files.
- `getAuthToken()` in `frontend/src/lib/auth.ts` is the existing mechanism for attaching `Authorization: Bearer` to fetch calls.

**Key discoveries:**
- `PaymentInstance.period` is a `String(7)` field in `YYYY-MM` format — year filtering is `period.startswith(f"{year}-")`.
- `PaymentInstance.template.currency` is available via the existing `selectinload(PaymentInstance.template)` already in the export query.
- The Payments page (`frontend/src/app/dashboard/payments/page.tsx`) already tracks `currentYear` and has an established error banner pattern (`loadError` state → red div) that the export error should mirror.
- Lucide-react `Download` icon is available (same package already used throughout the app).

## Desired End State

The Payments page shows an "Export .xlsx" button below the year-month selector. Clicking it triggers an authenticated fetch to `GET /export/xlsx?year=<currentYear>`, downloads a `.xlsx` file named `pay-tracker-<year>.xlsx`, and the file contains 12 worksheets (one per calendar month) with columns: Bill, Category, Period, Due Date, Amount, Currency, Status, Paid Amount, Paid At, Notes. Empty months produce a sheet with headers only. The button shows a spinner and is disabled while the download is in progress; a failure shows an inline error message.

### Key Discoveries

- Column set in the current backend export is missing `Category` and `Currency` — both are on `template` and both need to be added.
- `apiFetch` cannot be reused for binary downloads; `downloadXlsx` must be a standalone `fetch` call that reads `res.blob()`.

## What We're NOT Doing

- No year picker UI — always exports the current calendar year.
- No JSON backup button in this change (S-08 is a separate slice).
- No new npm dependencies on the frontend.
- No changes to the DB schema or Alembic migrations.
- No changes to other export endpoints (`/export/json`).

## Implementation Approach

**Phase 1** updates the backend endpoint: add `year` query param (default current year), filter by `period`, group into 12 monthly DataFrames, write each as a named worksheet, add the missing columns.

**Phase 2** adds the frontend: a standalone `downloadXlsx(year)` utility that does a raw `fetch` with the JWT header, reads the response as a Blob, and triggers a programmatic download. The Payments page gets an Export button using that utility, with loading/error state and i18n keys in EN, PL, and DE.

---

## Phase 1: Backend — year-scoped, month-grouped xlsx with Currency column

### Overview

Update `GET /export/xlsx` to accept a `year` query parameter, filter instances to that year, group them into 12 monthly DataFrames, and write each as a named worksheet. Add `Category` and `Currency` columns from the eagerly loaded template.

### Changes Required

#### 1. Export router — `/export/xlsx` endpoint

**File**: `backend/app/routers/export.py`

**Intent**: Replace the flat single-sheet export with a 12-sheet workbook scoped to a year. Accept `year: int = Query(default=current_year)`, filter instances where `period` starts with `f"{year}-"`, group by month (period `YYYY-MM`), write one worksheet per month named by the short month name (e.g. `"Jan 2026"`), and add `Category` and `Currency` columns.

**Contract**: The endpoint signature becomes `GET /export/xlsx?year=<int>`. The response filename changes to `pay-tracker-{year}.xlsx`. Column order in each sheet: `Bill`, `Category`, `Period`, `Due Date`, `Amount`, `Currency`, `Status`, `Paid Amount`, `Paid At`, `Notes`. Months with no instances produce a worksheet with column headers and no data rows. The `selectinload(PaymentInstance.template)` already in the query makes `template.currency` and `template.category` available without additional joins.

```python
# Signature addition — the only non-obvious part:
from datetime import date
from fastapi import Query

@router.get("/xlsx")
def export_xlsx(
    year: int = Query(default_factory=lambda: date.today().year),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
```

The month grouping loop should iterate `range(1, 13)` and build each sheet name as `calendar.month_abbr[m] + f" {year}"` (requires `import calendar`). Build a DataFrame per month from the filtered rows; write with `df.to_excel(writer, index=False, sheet_name=sheet_name)`.

### Success Criteria

#### Automated Verification

- Existing lint passes: `cd backend && uv run mypy app/ --ignore-missing-imports`
- Import check: `docker compose exec backend uv run python -c "from app.routers.export import export_xlsx; print('ok')"`

#### Manual Verification

- `GET http://localhost:8010/export/xlsx` (no `year` param) returns a `.xlsx` file with 12 sheets for the current year.
- `GET http://localhost:8010/export/xlsx?year=2025` returns a `.xlsx` for 2025.
- Each sheet is named `Jan 2026`, `Feb 2026`, etc.
- Columns in each sheet: Bill, Category, Period, Due Date, Amount, Currency, Status, Paid Amount, Paid At, Notes.
- A month with no payment instances has a sheet with column headers and zero data rows.
- Endpoint requires authentication (401 without token).

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Frontend — download button with loading/error feedback and i18n

### Overview

Add a standalone `downloadXlsx(year)` utility function, wire it to a new Export button on the Payments page, and add the required translation keys to all three language files.

### Changes Required

#### 1. Export API utility

**File**: `frontend/src/lib/export-api.ts` *(new file)*

**Intent**: Provide a typed `downloadXlsx(year: number): Promise<void>` that authenticates via the existing `getAuthToken()` mechanism, fetches the XLSX blob, and triggers a browser file download — without touching `apiFetch` (which only handles JSON).

**Contract**: The function reads the JWT via `getAuthToken()` from `@/lib/auth`, calls `fetch(`${BASE_URL}/export/xlsx?year=${year}`, { headers: { Authorization: \`Bearer ${token}\` } })`, reads `res.blob()`, creates a temporary object URL, programmatically clicks a hidden `<a>` element, then revokes the URL. On non-OK response, it throws `new Error("Export failed")`. `BASE_URL` comes from `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010"` (same constant as in `api.ts`).

#### 2. Payments page — Export button

**File**: `frontend/src/app/dashboard/payments/page.tsx`

**Intent**: Add an Export button below the year-month selector that calls `downloadXlsx(currentYear)`, disables itself with a spinner icon during the fetch, and shows an inline error on failure — matching the existing `loadError` error banner pattern.

**Contract**: Add two new state variables: `xlsxLoading: boolean` and `xlsxError: string | null`. The button uses Lucide `Download` icon (already available via `lucide-react`). While `xlsxLoading` is true the button is `disabled` and shows the loading label. On error, render an error `<div>` using the same red-border/red-bg classes as the existing `loadError` banner. Place the Export button and its error immediately after the closing `</div>` of the year-month selector block (before the `loadError` banner). Clear `xlsxError` on each new export attempt. Use `t("exportXlsx")`, `t("exportXlsxLoading")`, `t("exportXlsxError")` from the `PaymentsPage` namespace.

#### 3. English translations

**File**: `frontend/messages/en.json`

**Intent**: Add three export keys to the `PaymentsPage` namespace.

**Contract**: Add to the `"PaymentsPage"` object:
```json
"exportXlsx": "Export .xlsx",
"exportXlsxLoading": "Exporting…",
"exportXlsxError": "Export failed. Please try again."
```

#### 4. Polish translations

**File**: `frontend/messages/pl.json`

**Intent**: Add Polish equivalents of the three export keys.

**Contract**: Add to the `"PaymentsPage"` object:
```json
"exportXlsx": "Eksportuj .xlsx",
"exportXlsxLoading": "Eksportowanie…",
"exportXlsxError": "Eksport nie powiódł się. Spróbuj ponownie."
```

#### 5. German translations

**File**: `frontend/messages/de.json`

**Intent**: Add German equivalents of the three export keys.

**Contract**: Add to the `"PaymentsPage"` object:
```json
"exportXlsx": ".xlsx exportieren",
"exportXlsxLoading": "Exportiere…",
"exportXlsxError": "Export fehlgeschlagen. Bitte erneut versuchen."
```

### Success Criteria

#### Automated Verification

- TypeScript compilation: `cd frontend && npm run build` (or `npx tsc --noEmit`)
- Lint: `cd frontend && npm run lint`
- next-intl key consistency: all three language files contain the same keys under `PaymentsPage`

#### Manual Verification

- Clicking "Export .xlsx" on the Payments page triggers a browser download of `pay-tracker-<currentYear>.xlsx`.
- The button shows a spinner and is non-clickable during the download.
- Opening the file in Excel/LibreOffice shows 12 sheets (Jan–Dec for the current year).
- Each sheet has columns: Bill, Category, Period, Due Date, Amount, Currency, Status, Paid Amount, Paid At, Notes.
- A network failure (stop the backend) shows the inline error message in the UI.
- Button and error text render correctly in both English and Polish.

**Implementation Note**: Pause for manual confirmation after all automated checks pass.

---

## Testing Strategy

### Manual Testing Steps

1. Start the app: `docker compose up --build`
2. Log in, navigate to Payments.
3. Click "Export .xlsx" — verify file downloads and opens correctly in a spreadsheet app.
4. Verify 12 sheets, correct columns, correct data for months that have payment instances.
5. Stop the backend container, click Export — verify inline error appears.
6. Switch to Polish in the language toggle — verify button and error text are in Polish.

## References

- Backend export router: `backend/app/routers/export.py`
- Frontend api utility: `frontend/src/lib/api.ts`
- Frontend auth token: `frontend/src/lib/auth.ts`
- Payments page: `frontend/src/app/dashboard/payments/page.tsx`
- Roadmap: `context/foundation/roadmap.md` (S-04)
- PRD: FR-010

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — year-scoped, month-grouped xlsx with Currency column

#### Automated

- [x] 1.1 Mypy lint passes on updated export.py
- [x] 1.2 Import check passes in running container

#### Manual

- [x] 1.3 GET /export/xlsx returns 12-sheet workbook for current year
- [x] 1.4 GET /export/xlsx?year=2025 returns 12-sheet workbook for 2025
- [x] 1.5 Each sheet named Jan/Feb/…/Dec YYYY with correct columns including Category and Currency
- [x] 1.6 Empty-month sheets have headers only (no data rows)
- [x] 1.7 Endpoint returns 401 without valid auth token

### Phase 2: Frontend — download button with loading/error feedback and i18n

#### Automated

- [x] 2.1 TypeScript build passes (npm run build or tsc --noEmit)
- [x] 2.2 Lint passes (npm run lint)
- [x] 2.3 All three language files have matching PaymentsPage export keys

#### Manual

- [x] 2.4 Export button triggers file download with correct filename
- [x] 2.5 Button shows spinner and is disabled during download
- [x] 2.6 File opens with 12 sheets and correct columns/data
- [x] 2.7 Network failure shows inline error message
- [x] 2.8 UI renders correctly in English and Polish
