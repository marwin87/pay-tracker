# Bill Template Management — Plan Brief

> Full plan: `context/changes/bill-template-management/plan.md`

## What & Why

Build the frontend UI for managing bill templates — the core CRUD surface for FR-003, FR-004, and FR-005. Without this, users have no way to define the bills the system tracks. The backend API is complete; this change is purely frontend.

## Starting Point

The dashboard is a stub ("You are logged in" + logout button). The `apiFetch` utility and auth context already handle token management. All four backend endpoints (`GET/POST /bills`, `PATCH /bills/{id}`, `POST /bills/{id}/archive`) are implemented and documented at `http://localhost:8010/docs`.

## Desired End State

`/dashboard/bills` shows an active list of bill templates with inline accordion forms for create (at top) and edit (per row). Paused templates appear muted with a badge. Archiving requires a confirmation dialog. `/dashboard/bills/archived` shows a read-only archive view. The dashboard home links to bill management.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Form placement | Inline accordion | Keeps user in context without overlays; consistent pattern for both create and edit | Plan |
| Category input | Combobox (native `<datalist>`) | Free text with suggestions from existing templates, no external dependency | Plan |
| Archive confirmation | Confirmation dialog | Prevents accidental archives; reinforces that history is preserved | Plan |
| Validation timing | On submit, then live | Non-intrusive UX; errors appear after first Save then update as user types | Plan |
| Paused visibility | Muted row + badge | Communicates non-generating state without hiding the template | Plan |
| Archived view | Separate `/dashboard/bills/archived` page | Keeps active list clean; clear separation between active and terminal state | Plan |
| due_day field | Shown only for monthly/quarterly | Not meaningful for annual or one_off; avoids confusing the user | Plan |

## Scope

**In scope:**
- `lib/bills-api.ts` — TypeScript types + four API functions
- `/dashboard/bills` — list + inline create/edit accordion + archive confirm dialog
- `/dashboard/bills/archived` — read-only archived templates list
- Dashboard page update — navigation link to bills

**Out of scope:**
- Payment instance UI (FR-007, FR-008) — separate change
- Email reminders (FR-012)
- Export/backup (FR-010, FR-011)
- Un-archiving (no backend support)

## Architecture / Approach

New `frontend/src/components/bills/` directory holds four components: `CategoryCombobox`, `ArchiveConfirmDialog`, `BillTemplateForm`, `BillTemplateRow`. Pages live in the App Router at `src/app/dashboard/bills/`. A single `expandedId: number | "new" | null` state on the list page enforces accordion mutual exclusion. All API calls go through the typed functions in `lib/bills-api.ts`, which wrap the existing `apiFetch` utility.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API layer + types | `lib/bills-api.ts` with TS types and four functions | `amount` comes back as string from JSON (Decimal) — types must reflect this |
| 2. Bills list page | Full inline accordion create/edit + archive dialog at `/dashboard/bills` | Accordion mutual exclusion state; due_day conditional visibility |
| 3. Archived page + nav | `/dashboard/bills/archived` + dashboard navigation link | None — straightforward once Phase 2 patterns are established |

**Prerequisites:** Docker stack running (`docker compose up --build`); user registered and logged in  
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- Next.js 16 App Router conventions may differ from training data — read `node_modules/next/dist/docs/01-app/` before writing any page component
- `amount` is serialised as a string in JSON (FastAPI serialises Python `Decimal` as a number, but TypeScript should treat it as `string` to avoid float precision issues — verify against actual API response)

## Success Criteria (Summary)

- User can create, edit, and archive bill templates via the UI with no page reloads
- Paused and archived templates are visually distinguishable from active ones
- All operations survive a page refresh (data persisted to backend)
