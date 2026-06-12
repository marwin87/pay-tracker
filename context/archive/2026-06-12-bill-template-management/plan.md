# Bill Template Management Implementation Plan

## Overview

Build the frontend UI for managing bill templates — create, edit, archive, and list. The backend API (`GET/POST /bills`, `PATCH /bills/{id}`, `POST /bills/{id}/archive`) is fully implemented. This change adds the TypeScript API layer and all React components to the Next.js frontend, covering FR-003, FR-004, and FR-005.

## Current State Analysis

The backend exposes four endpoints that are already production-ready and tested via `http://localhost:8010/docs`. The frontend has authentication (login/register/session management) but the dashboard (`/dashboard/page.tsx`) is a stub — just "You are logged in" with a logout button. No bill-related UI exists.

**Key patterns in the existing frontend:**
- All API calls go through `apiFetch<T>()` in `lib/api.ts`, which injects the auth token and normalises errors
- Form state managed with `useState` (no form library)
- Tailwind utility classes with `bg-background`, `text-foreground`, `border-foreground/10` design tokens
- `"use client"` directive on all interactive pages

## Desired End State

`/dashboard/bills` shows an active list of bill templates (name, amount, frequency, due day) with inline accordions for create (at top) and edit (per row). A confirmation dialog guards the archive action. Paused templates appear muted with a "Paused" badge. `/dashboard/bills/archived` shows a read-only list of archived templates. The dashboard home page links to bill management.

### Key Discoveries:

- `apiFetch` returns `Promise<T>` and throws on non-OK — consume with try/catch
- Auth token injected automatically — API functions need no auth plumbing
- `BillFrequency` enum values: `monthly`, `quarterly`, `annual`, `one_off`
- `due_day` is nullable (only meaningful for monthly/quarterly bills)
- The `is_archived` field is write-once via `POST /{id}/archive` — there is no unarchive endpoint
- Native `<datalist>` + `<input list="...">` delivers free-text + suggestions without a dependency

## What We're NOT Doing

- Payment instance UI (FR-007, FR-008) — separate change
- Email reminders (FR-012)
- Export/backup (FR-010, FR-011)
- Un-archiving (no backend support; not in PRD scope)
- Form library (react-hook-form etc.) — the form surface doesn't justify it

## Implementation Approach

Three phases: API layer first, then the main list page with all interactive components, then the archived page and dashboard navigation link. Components go in `frontend/src/components/bills/` (new directory). Pages use the App Router file-based routing.

## Critical Implementation Details

- **`due_day` visibility**: only show the due day field in the form when `frequency` is `monthly` or `quarterly`. For `annual` and `one_off`, send `null` — the backend accepts it.
- **Category combobox**: collect unique category strings from the loaded templates and feed them into a `<datalist>` element. The `<input list="...">` provides native autocomplete without a library. Categories can be `null` — treat empty string as `null` before sending to the API.
- **Accordion mutual exclusion**: at most one accordion (create or one edit row) open at a time. Clicking Edit on a new row closes any previously open accordion.

---

## Phase 1: API Layer + Types

### Overview

Create `frontend/src/lib/bills-api.ts` with TypeScript types mirroring the backend Pydantic schemas and four typed functions wrapping `apiFetch`. No React, no components — just the data layer.

### Changes Required:

#### 1. Bills API module

**File**: `frontend/src/lib/bills-api.ts`

**Intent**: Define all TypeScript types for bill templates and expose four async functions the UI components will call. Centralises the API contract so components never call `apiFetch` directly for bills.

**Contract**:

Types to define:
- `BillFrequency`: `"monthly" | "quarterly" | "annual" | "one_off"`
- `BillTemplateOut`: mirrors `BillTemplateOut` Pydantic schema — `id`, `name`, `category: string | null`, `frequency: BillFrequency`, `amount: string` (JSON numbers come as strings from Decimal), `due_day: number | null`, `notes: string | null`, `is_archived: boolean`, `is_paused: boolean`, `created_at: string`
- `BillTemplateCreate`: `name: string`, `category?: string | null`, `frequency: BillFrequency`, `amount: string`, `due_day?: number | null`, `notes?: string | null`, `is_paused?: boolean`
- `BillTemplateUpdate`: all fields from `BillTemplateCreate` made optional

Functions:
- `fetchBills(includeArchived?: boolean): Promise<BillTemplateOut[]>` — `GET /bills?include_archived=...`
- `createBill(data: BillTemplateCreate): Promise<BillTemplateOut>` — `POST /bills`
- `updateBill(id: number, data: BillTemplateUpdate): Promise<BillTemplateOut>` — `PATCH /bills/{id}`
- `archiveBill(id: number): Promise<void>` — `POST /bills/{id}/archive`

### Success Criteria:

#### Automated Verification:

- TypeScript compiles with no errors: `cd frontend && npx tsc --noEmit`
- ESLint passes: `cd frontend && npm run lint`

#### Manual Verification:

- Import and call `fetchBills()` from browser console (after login) returns an array

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Bill Templates List Page

### Overview

Build the `/dashboard/bills` page with the full inline accordion experience. Four components are needed: `CategoryCombobox`, `ArchiveConfirmDialog`, `BillTemplateForm`, and `BillTemplateRow`. The page component orchestrates state (active accordion, loading, error, template list).

### Changes Required:

#### 1. CategoryCombobox component

**File**: `frontend/src/components/bills/CategoryCombobox.tsx`

**Intent**: A plain text input backed by a `<datalist>` populated with unique categories from the existing templates. Allows typing a new category or selecting an existing one.

**Contract**: Props: `value: string`, `onChange: (v: string) => void`, `suggestions: string[]`. Renders `<input list="bill-categories" ...>` paired with a `<datalist id="bill-categories">`. Returns `"use client"` component.

#### 2. ArchiveConfirmDialog component

**File**: `frontend/src/components/bills/ArchiveConfirmDialog.tsx`

**Intent**: A blocking confirmation overlay that names the bill and warns that payment history is preserved. Has Cancel and Archive buttons.

**Contract**: Props: `billName: string`, `onConfirm: () => void`, `onCancel: () => void`. Renders as a fixed overlay with a centred card. Archive button should be styled destructively (e.g., red or muted-danger tone) to signal irreversibility. Uses `"use client"`.

#### 3. BillTemplateForm component

**File**: `frontend/src/components/bills/BillTemplateForm.tsx`

**Intent**: Shared inline form for both create and edit. Renders the full set of fields, handles submit-then-live validation, and calls the appropriate API function via a callback prop.

**Contract**: Props:
- `initial?: Partial<BillTemplateCreate>` — pre-fills fields for edit mode (empty for create)
- `categorySuggestions: string[]`
- `onSave: (data: BillTemplateCreate) => Promise<void>` — parent calls create or update
- `onCancel: () => void`

Required fields: name, frequency, amount. Optional: category, due_day (only shown when frequency is `monthly` or `quarterly`), notes, is_paused (checkbox).

Validation rules (client-side):
- `name`: non-empty string
- `amount`: parseable as positive number
- `due_day` (when visible): integer 1–31

Error display: after first submit attempt, show inline error messages below each invalid field. Errors update live (on change) once the first submit has been attempted.

#### 4. BillTemplateRow component

**File**: `frontend/src/components/bills/BillTemplateRow.tsx`

**Intent**: Renders a single template in collapsed state (name, amount, frequency, due day, paused badge) with an Edit button and Archive button. When in edit mode (expanded), renders `BillTemplateForm` inline below.

**Contract**: Props:
- `template: BillTemplateOut`
- `isExpanded: boolean`
- `categorySuggestions: string[]`
- `onEditToggle: () => void` — parent manages which row is expanded
- `onSave: (data: BillTemplateUpdate) => Promise<void>`
- `onArchive: () => void` — triggers archive confirmation in parent

Paused state: when `template.is_paused` is true, apply `opacity-60` to the row text and show a small "Paused" badge (e.g., `text-xs bg-amber-100 text-amber-700 rounded px-1`).

#### 5. Bills list page

**File**: `frontend/src/app/dashboard/bills/page.tsx`

**Intent**: The main bill templates management page. Loads templates on mount, manages the open accordion state, wires all CRUD operations, and shows the inline create form at the top when the "+ New Bill" button is clicked.

**Contract**:
- State: `templates: BillTemplateOut[]`, `expandedId: number | "new" | null`, `archiveTarget: BillTemplateOut | null`
- On mount: call `fetchBills()` and set `templates`
- `"+ New Bill"` button: sets `expandedId = "new"` (closes if already open — toggle)
- Edit button in `BillTemplateRow`: sets `expandedId = template.id`
- Opening any accordion closes the previously open one (mutual exclusion via the single `expandedId` state)
- After successful create/edit: re-fetch the list and close the accordion
- Archive: sets `archiveTarget = template`; on confirm calls `archiveBill(id)`, then re-fetches; on cancel clears `archiveTarget`
- Empty state (no templates and create form closed): show a prompt — "No bills yet. Add your first bill."
- Loading state: show a skeleton or "Loading…" text while the initial fetch is in flight
- API errors: display inline above the list

Extract unique non-null categories from the loaded templates and pass as `categorySuggestions` to all form instances.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles with no errors: `cd frontend && npx tsc --noEmit`
- ESLint passes: `cd frontend && npm run lint`

#### Manual Verification:

- Navigate to `/dashboard/bills` — list loads (empty state shown on fresh DB)
- Click "+ New Bill", fill in fields, save — new template appears in list
- Edit an existing template — changes persist after save
- Open edit accordion, then click "+ New Bill" — edit accordion closes, create form opens
- Archive a template — confirmation dialog appears with template name, confirming removes it from active list
- Paused template appears muted with "Paused" badge
- Due day field hidden for `annual` and `one_off` frequencies
- Empty name or invalid amount shows inline error on Save; error clears as you type after first submit
- Page is usable at 375px width (no horizontal overflow)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Archived Page + Dashboard Navigation

### Overview

Build the read-only archived templates page and update the dashboard stub to link to bill management.

### Changes Required:

#### 1. Archived templates page

**File**: `frontend/src/app/dashboard/bills/archived/page.tsx`

**Intent**: Shows all archived templates in a read-only list. No create/edit/archive actions — archived is a terminal state. Includes a "Back to active bills" link.

**Contract**: On mount calls `fetchBills(true)` (include_archived=true), then filters to `is_archived === true`. Displays name, amount, frequency, category (if set), and a "Archived" badge. No action buttons.

#### 2. Dashboard page update

**File**: `frontend/src/app/dashboard/page.tsx`

**Intent**: Update the placeholder dashboard to include navigation to bill management. Adds a "Manage Bills" link that routes to `/dashboard/bills`.

**Contract**: Keep the existing logout button. Add a primary action button/link: "Manage Bills" → `/dashboard/bills`. Optionally add "View archived" → `/dashboard/bills/archived`.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles with no errors: `cd frontend && npx tsc --noEmit`
- ESLint passes: `cd frontend && npm run lint`

#### Manual Verification:

- Dashboard shows "Manage Bills" link; clicking navigates to `/dashboard/bills`
- From bills page, navigating to `/dashboard/bills/archived` shows archived templates
- Archiving a template from the active list and then visiting the archived page shows it there
- "Back to active bills" link on the archived page navigates correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Manual Testing Steps:

1. Start the stack: `docker compose up --build`
2. Register a user and log in
3. Navigate to `/dashboard/bills` via the dashboard link
4. Create 3 templates: one monthly, one annual, one with `is_paused = true`
5. Verify: monthly template shows due day; annual does not
6. Verify: paused template shows muted + badge
7. Edit the monthly template — change amount; verify persists
8. Archive the annual template — confirm dialog; verify removed from active list
9. Navigate to `/dashboard/bills/archived` — verify archived template appears
10. Attempt to submit empty form — verify name and amount errors appear
11. Fix errors one by one — verify errors clear as you type

## References

- PRD: `context/foundation/prd.md` — FR-003, FR-004, FR-005
- Backend router: `backend/app/routers/bills.py`
- Backend schemas: `backend/app/schemas/bill.py`
- Backend model: `backend/app/models/bill.py`
- Existing API utility: `frontend/src/lib/api.ts`
- Auth pattern reference: `frontend/src/app/login/page.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API Layer + Types

#### Automated

- [x] 1.1 TypeScript compiles with no errors: `cd frontend && npx tsc --noEmit`
- [x] 1.2 ESLint passes: `cd frontend && npm run lint`

#### Manual

- [x] 1.3 `fetchBills()` called from browser console returns an array

### Phase 2: Bill Templates List Page

#### Automated

- [x] 2.1 TypeScript compiles with no errors: `cd frontend && npx tsc --noEmit`
- [x] 2.2 ESLint passes: `cd frontend && npm run lint`

#### Manual

- [x] 2.3 `/dashboard/bills` loads with empty state on fresh DB
- [x] 2.4 Create, edit, and archive operations work end-to-end
- [x] 2.5 Accordion mutual exclusion works correctly
- [x] 2.6 Paused template appears muted with badge
- [x] 2.7 Due day hidden for annual and one_off frequencies
- [x] 2.8 Inline validation fires on submit then lives on change
- [x] 2.9 Page usable at 375px width

### Phase 3: Archived Page + Dashboard Navigation

#### Automated

- [x] 3.1 TypeScript compiles with no errors: `cd frontend && npx tsc --noEmit`
- [x] 3.2 ESLint passes: `cd frontend && npm run lint`

#### Manual

- [x] 3.3 Dashboard shows "Manage Bills" link navigating to `/dashboard/bills`
- [x] 3.4 Archived page shows archived templates
- [x] 3.5 "Back to active bills" link works
