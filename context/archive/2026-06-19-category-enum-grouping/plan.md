# Category Enum & Grouping Implementation Plan

## Overview

Promote `category` on `BillTemplate` from a free-text nullable string to a required enum with 9 predefined values (Housing, Utilities, Insurance, Subscriptions, Entertainment, Transport, Healthcare, Education, Other). Replace the datalist combobox with a typed `<select>`, enforce the field as required in the form, and render bills (active + archived) and payments in category-grouped sections.

---

## Current State Analysis

- `BillTemplate.category` is `String(100)` nullable in the DB; `str | None` in Pydantic and TypeScript.
- The form renders `CategoryCombobox` — an `<input>` with an HTML5 `<datalist>` for suggestions derived from existing bills.
- `BillTemplateRow` shows category as a plain gray text badge (raw string, no i18n).
- `PaymentInstanceOut` has no `category` field. The payments router already `selectinload`s the template, so adding the field costs one dict key.
- The XLSX export already writes a `"Category"` column — no change needed there.
- Backup restore uses `BackupTemplate.category: str | None` and passes it directly to `BillTemplate(category=...)`. Old backup files may contain arbitrary strings.
- Lessons.md rule: **write Alembic migrations manually** — autogenerate misses or silently skips column type changes. Always verify the generated DDL.

## Desired End State

- `category` column is `VARCHAR(50) NOT NULL` in `bill_templates`.
- All 9 predefined enum values are accepted; any other value is rejected at the API layer.
- The bill form has a `<select>` with 9 options and a required validation error if none is chosen.
- Bills page shows bills grouped under category headers: `Utilities · 3 bills`, sorted alphabetically within each group.
- Archived bills page mirrors the same grouping.
- Payments page shows payment rows under fixed non-collapsible category headers.
- Backup restore maps unknown/null category values to `"other"` silently.

### Key Discoveries

- `backend/app/routers/bills.py:101–116` — payments response is built as a plain dict; add `"category": inst.template.category` here.
- `backend/app/routers/export.py:208–210` — restore loop does `category=bt.category`; coerce here before passing to ORM.
- `frontend/src/components/bills/BillTemplateForm.tsx:25` — `categorySuggestions: string[]` prop flows from page → row → form; all three layers need the prop removed.
- `frontend/src/app/dashboard/bills/archived/page.tsx:84–110` — archived page has its own flat render loop; needs its own grouped version.
- `frontend/messages/en.json`, `pl.json`, `de.json` — add `"Categories"` namespace.

## What We're NOT Doing

- No user-manageable categories (no add/rename/delete UI, no `categories` DB table).
- No collapsible category sections — fixed section headers only.
- No category filter/search — grouping only.
- No changes to XLSX export (already works with enum string values).
- No changes to payment row UI beyond grouping context (category not shown as a badge on the row itself).

## Implementation Approach

Three sequential phases: backend first (model, schema, migration, router), then frontend plumbing (types, select component, form validation), then layout (grouped renders + i18n). This ordering ensures TypeScript types are correct before layout work begins, and the backend API returns `category` on payments before the payments page tries to use it.

---

## Critical Implementation Details

**Migration must be written manually.** Per lessons.md, autogenerate is unreliable for column type/nullability changes. After running `--autogenerate`, open the file and verify it contains the exact DDL below before running `upgrade head`. If it only shows FK noise, discard and write the migration body by hand.

**DB wipe is the intended upgrade path for dev.** Run `docker compose down -v && docker compose up --build` — migrations apply from scratch on a clean volume. The migration still includes a safe `UPDATE` step for any non-empty environment.

---

## Phase 1: Backend — Enum, Schema, Migration, Router

### Overview

Add the `BillCategory` Python enum, update all Pydantic schemas, write the Alembic migration, expose `category` on the payments response, and coerce unknown category values during backup restore.

### Changes Required

#### 1. `BillCategory` enum + model column

**File**: `backend/app/models/bill.py`

**Intent**: Define `BillCategory` as a `str, Enum` with 9 values and change the `category` column from `String(100)` nullable to `String(50)` not-null, typed as `Mapped[BillCategory]`.

**Contract**: New enum sits alongside the existing `BillFrequency` and `PaymentStatus` enums. Column declaration:
```python
class BillCategory(str, Enum):
    housing = "housing"
    utilities = "utilities"
    insurance = "insurance"
    subscriptions = "subscriptions"
    entertainment = "entertainment"
    transport = "transport"
    healthcare = "healthcare"
    education = "education"
    other = "other"

# in BillTemplate:
category: Mapped[BillCategory] = mapped_column(String(50), nullable=False)
```

#### 2. Schema updates

**File**: `backend/app/schemas/bill.py`

**Intent**: Replace `str | None` with `BillCategory` (or `BillCategory | None` for patch) across all schemas, and add `category` to `PaymentInstanceOut`. Keep `BackupTemplate.category` as `str | None` so old backup files parse without error — coercion happens in the restore router.

**Contract**:
- `BillTemplateCreate.category: BillCategory` — required, no default
- `BillTemplateUpdate.category: BillCategory | None = None` — optional for PATCH semantics
- `BillTemplateOut.category: BillCategory` — non-nullable
- `PaymentInstanceOut` — add `category: BillCategory` field
- `BackupTemplate.category: str | None` — keep as loose string

#### 3. Alembic migration

**File**: new file under `backend/alembic/versions/` (generate then hand-edit)

**Intent**: Safely migrate the `category` column from nullable `VARCHAR(100)` to required `VARCHAR(50)` matching the enum vocabulary.

**Contract**: Migration body must contain exactly:
```python
def upgrade() -> None:
    op.execute(
        """
        UPDATE bill_templates
        SET category = 'other'
        WHERE category IS NULL
           OR category NOT IN (
               'housing','utilities','insurance','subscriptions',
               'entertainment','transport','healthcare','education','other'
           )
        """
    )
    op.alter_column(
        'bill_templates', 'category',
        existing_type=sa.String(100),
        type_=sa.String(50),
        nullable=False,
    )

def downgrade() -> None:
    op.alter_column(
        'bill_templates', 'category',
        existing_type=sa.String(50),
        type_=sa.String(100),
        nullable=True,
    )
```
Generate with: `docker compose exec backend uv run alembic revision --autogenerate -m "bill_category_enum"`
Open the file and replace the `upgrade`/`downgrade` bodies with the above. Do not trust the autogenerated body.

#### 4. Payments router — add category to response dict

**File**: `backend/app/routers/bills.py`

**Intent**: Expose `category` on every payment instance response so the frontend can group by it. The template is already eager-loaded.

**Contract**: In `list_payments`, add `"category": inst.template.category` to the `d` dict alongside the existing `"bill_name"`, `"currency"`, `"frequency"` keys (lines ~102–116).

#### 5. Restore coercion

**File**: `backend/app/routers/export.py`

**Intent**: When restoring a backup that predates this change, map any unrecognised or null category value to `BillCategory.other` rather than raising a 422.

**Contract**: Before the restore loop, define a helper:
```python
_VALID_CATEGORIES = {c.value for c in BillCategory}

def _coerce_category(raw: str | None) -> BillCategory:
    if raw in _VALID_CATEGORIES:
        return BillCategory(raw)
    return BillCategory.other
```
In the loop, replace `category=bt.category` with `category=_coerce_category(bt.category)`. Import `BillCategory` from `app.models.bill`.

### Success Criteria

#### Automated Verification

- Migration applies cleanly on a wiped DB: `docker compose down -v && docker compose up --build` — no startup errors
- `GET /bills/payments?month=YYYY-MM` response includes `"category"` key on each item
- `POST /bills` with no `category` field returns 422
- `POST /bills` with `category: "invalid"` returns 422
- `POST /bills` with `category: "utilities"` returns 201

#### Manual Verification

- Restore an old backup (with free-text or null categories) — succeeds, affected bills land in "Other"

---

## Phase 2: Frontend Types, CategorySelect, Form Validation

### Overview

Update TypeScript types to match the backend enum, replace `CategoryCombobox` with a typed `<select>`, update the form to validate category as required, and remove the `categorySuggestions` prop from the three-layer chain (page → row → form).

### Changes Required

#### 1. `BillCategory` TypeScript type + bills API types

**File**: `frontend/src/lib/bills-api.ts`

**Intent**: Export a `BillCategory` union type matching the 9 enum values and update `BillTemplateOut.category` to non-nullable, `BillTemplateCreate.category` to required.

**Contract**:
```typescript
export type BillCategory =
  | "housing" | "utilities" | "insurance" | "subscriptions"
  | "entertainment" | "transport" | "healthcare" | "education" | "other";

// in BillTemplateOut:
category: BillCategory;   // was: string | null

// in BillTemplateCreate:
category: BillCategory;   // was: category?: string | null
```
Remove `categorySuggestions` from any type that carried it (it's computed state, never a type).

#### 2. `PaymentInstanceOut` — add category

**File**: `frontend/src/lib/payments-api.ts`

**Intent**: Add `category` to the frontend payment type so grouped renders can key on it.

**Contract**: Import `BillCategory` from `"./bills-api"` and add `category: BillCategory` to `PaymentInstanceOut`.

#### 3. Shared categories constant

**File**: `frontend/src/lib/categories.ts` (new file)

**Intent**: Single source of truth for display order and the set of valid category values, reused by both the Bills and Payments grouped renders.

**Contract**:
```typescript
import type { BillCategory } from "./bills-api";

export const CATEGORY_ORDER: BillCategory[] = [
  "housing", "utilities", "insurance", "subscriptions",
  "entertainment", "transport", "healthcare", "education", "other",
];
```
No label strings here — labels come from i18n via `useTranslations("Categories")`.

#### 4. Replace `CategoryCombobox` with `CategorySelect`

**File**: `frontend/src/components/bills/CategoryCombobox.tsx`

**Intent**: Replace the free-text `<input>` + `<datalist>` with a `<select>` element showing the 9 predefined options plus a blank placeholder option (for the unselected / required-error state). Keep the same filename to avoid import churn.

**Contract**: Props change to `{ id: string; value: BillCategory | ""; onChange: (v: BillCategory | "") => void }`. No `suggestions` prop. Render a `<option value="">—</option>` placeholder followed by one `<option>` per `CATEGORY_ORDER` entry, labelled via `useTranslations("Categories")`. Match the existing `inputClass` styling used in `BillTemplateForm`.

#### 5. `BillTemplateForm` — required category, remove suggestions prop

**File**: `frontend/src/components/bills/BillTemplateForm.tsx`

**Intent**: Make category a required field with a validation error, remove the now-unused `categorySuggestions` prop, and type the `category` state as `BillCategory | ""`.

**Contract**:
- Remove `categorySuggestions: string[]` from `Props` interface.
- Change `category` state: `useState<BillCategory | "">(initial?.category ?? "")`.
- Add `category?: string` to the `Errors` interface.
- In `validate()`: if `category === ""`, set `e.category = t("categoryRequired")`.
- On submit: `category: category as BillCategory` (safe — validation guards the empty case).
- Pass `value={category}` and `onChange={setCategory}` to `CategoryCombobox`; remove `suggestions` prop.
- Add an error message element below the `CategoryCombobox` for `errors.category`.

#### 6. `BillTemplateRow` — remove suggestions passthrough

**File**: `frontend/src/components/bills/BillTemplateRow.tsx`

**Intent**: Remove the `categorySuggestions` prop that was threaded through to the inline edit form, and update the collapsed row's category display to show an i18n label instead of the raw enum value.

**Contract**:
- Remove `categorySuggestions: string[]` from `Props` interface and the prop destructure.
- Remove `categorySuggestions={categorySuggestions}` from the `BillTemplateForm` call inside the expanded section.
- Replace the raw `{template.category}` text in the collapsed row header with `tCategories(template.category)` using `useTranslations("Categories")`.

### Success Criteria

#### Automated Verification

- `npm run lint` in `frontend/` passes with no TypeScript errors
- `BillTemplateCreate.category` is typed as `BillCategory` (not optional, not nullable)

#### Manual Verification

- Open create-bill form → Category field shows a `<select>` with 9 options
- Submit without choosing a category → validation error shown under the field
- Submit with a chosen category → saves successfully
- Existing bill with a category → inline edit form pre-selects the correct option
- Category badge on collapsed row shows the translated label (e.g. "Utilities", not "utilities")

---

## Phase 3: Grouped Layouts + i18n

### Overview

Add the `"Categories"` i18n namespace to all three locale files, then replace the flat list renders on the Bills page, Archived Bills page, and Payments page with category-grouped section layouts. Bills page header: `"Utilities · 3 bills"`. Payments page: plain category name divider. Both sort alphabetically within each group.

### Changes Required

#### 1. i18n — Categories namespace

**Files**: `frontend/messages/en.json`, `frontend/messages/pl.json`, `frontend/messages/de.json`

**Intent**: Provide translated display labels for all 9 categories, used by the section headers and the `CategorySelect` option labels.

**Contract**: Add a top-level `"Categories"` key to each file:

```json
// en.json
"Categories": {
  "housing": "Housing",
  "utilities": "Utilities",
  "insurance": "Insurance",
  "subscriptions": "Subscriptions",
  "entertainment": "Entertainment",
  "transport": "Transport",
  "healthcare": "Healthcare",
  "education": "Education",
  "other": "Other"
}
```

Polish (`pl.json`): Mieszkanie, Media, Ubezpieczenie, Subskrypcje, Rozrywka, Transport, Zdrowie, Edukacja, Inne

German (`de.json`): Wohnen, Versorgung, Versicherung, Abonnements, Unterhaltung, Transport, Gesundheit, Bildung, Sonstiges

#### 2. Bills page — grouped render

**File**: `frontend/src/app/dashboard/bills/page.tsx`

**Intent**: Replace the flat `templates.map(…)` render with a grouped layout: one section per category (in `CATEGORY_ORDER` order), each showing a header chip and the bills for that group sorted alphabetically by name. Remove the `categorySuggestions` computation.

**Contract**:
- Remove the `categorySuggestions` const and all prop passes.
- Before render, group `templates` by `category` using `CATEGORY_ORDER` as the iteration order (skip categories with no templates).
- Section header element: `<div>` with category label from `useTranslations("Categories")` + `· N bills` count.
- Bills within each section: same `BillTemplateRow` components, sorted `a.name.localeCompare(b.name)`.
- The `expandedId === "new"` inline form renders above the grouped list as before (unchanged).
- Empty state (no templates at all) is unchanged.

#### 3. Archived Bills page — grouped render

**File**: `frontend/src/app/dashboard/bills/archived/page.tsx`

**Intent**: Mirror the active bills grouping: same `CATEGORY_ORDER` iteration, same header style (`"Utilities · 2 archived"`), alphabetical sort within group.

**Contract**: The archived page renders its own simpler row `<div>` (not `BillTemplateRow`). Wrap those rows in the same grouped structure. Header label from `useTranslations("Categories")`.

#### 4. Payments page — category-grouped payment list

**File**: `frontend/src/app/dashboard/payments/page.tsx`

**Intent**: Replace the flat `instances.map(…)` render with a grouped layout: a plain category-name divider row above each group of payment rows, in `CATEGORY_ORDER` order. No collapsing. Sort within group by `due_date` (preserving existing backend sort order).

**Contract**:
- Import `CATEGORY_ORDER` from `@/lib/categories`.
- Before render, group `instances` by `category` using `CATEGORY_ORDER` as iteration order (skip empty categories).
- Section divider: a non-interactive `<div>` with the translated category name. Style to match the existing month header aesthetic (small, muted, uppercase or semibold).
- Each group renders `PaymentRow` components as before.
- The existing summary line (`N upcoming · N overdue · N paid`) above the list is unchanged.

### Success Criteria

#### Automated Verification

- `npm run lint` in `frontend/` passes with no errors

#### Manual Verification

- Bills page: bills appear under category section headers in CATEGORY_ORDER; each header shows correct count
- Bills page: bills within each category are sorted A–Z by name
- Archived bills page: same grouping as active bills
- Payments page: payment rows grouped by category with plain divider headers; `CATEGORY_ORDER` respected
- All category labels show the locale-appropriate translation (switch locale to verify)
- Newly created bill appears in the correct category group immediately on save

---

## Testing Strategy

### Manual Testing Steps

1. Wipe and restart: `docker compose down -v && docker compose up --build` — confirm clean startup
2. Create bills in several different categories; confirm they appear under the correct grouped header
3. Edit a bill and change its category; confirm it moves to the new group on save
4. Create a bill with no category selected; confirm the form shows a validation error
5. Export JSON backup; restore it — confirm categories are preserved
6. Restore an old backup with non-enum category strings — confirm bills land in "Other" without error
7. Switch locale (EN → PL → DE) and verify category labels translate on both Bills and Payments pages

## Migration Notes

**Development (recommended path):**
```
docker compose down -v && docker compose up --build
```
Fresh volume — migration runs from scratch, no data to coerce.

**Existing data path (non-empty DB):** The migration's `UPDATE` step maps all null/unrecognised values to `'other'` before adding the `NOT NULL` constraint.

## References

- Alembic rule: `context/foundation/lessons.md` — "Alembic autogenerate misses columns; write migrations manually"
- Model pattern: `backend/app/models/bill.py` — `BillFrequency` enum for the enum definition pattern
- Payments router dict: `backend/app/routers/bills.py:100–120`
- Restore loop: `backend/app/routers/export.py:207–223`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — Enum, Schema, Migration, Router

#### Automated

- [x] 1.1 Migration applies cleanly on wiped DB (`docker compose down -v && docker compose up --build`)
- [x] 1.2 `GET /bills/payments` response includes `category` on each item
- [x] 1.3 `POST /bills` with no `category` returns 422
- [x] 1.4 `POST /bills` with `category: "invalid"` returns 422
- [x] 1.5 `POST /bills` with `category: "utilities"` returns 201

#### Manual

- [ ] 1.6 Restore old backup with free-text/null categories — succeeds, affected bills in "Other"

### Phase 2: Frontend Types, CategorySelect, Form Validation

#### Automated

- [x] 2.1 `npm run lint` passes with no TypeScript errors

#### Manual

- [ ] 2.2 Category `<select>` shows 9 options in create-bill form
- [ ] 2.3 Submit without category → validation error shown
- [ ] 2.4 Submit with chosen category → saves successfully
- [ ] 2.5 Edit existing bill → select pre-populated with correct category
- [ ] 2.6 Collapsed row shows translated category label (not raw enum string)

### Phase 3: Grouped Layouts + i18n

#### Automated

- [x] 3.1 `npm run lint` passes with no errors

#### Manual

- [ ] 3.2 Bills page: groups appear in CATEGORY_ORDER; each header shows correct bill count
- [ ] 3.3 Bills within each group sorted A–Z
- [ ] 3.4 Archived bills page: same grouping as active bills
- [ ] 3.5 Payments page: payment rows grouped under category dividers in CATEGORY_ORDER
- [ ] 3.6 Category labels translate correctly when switching locale
- [ ] 3.7 New bill appears in correct group immediately after save
