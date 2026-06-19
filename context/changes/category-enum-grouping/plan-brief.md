# Category Enum & Grouping — Plan Brief

> Full plan: `context/changes/category-enum-grouping/plan.md`

## What & Why

`category` on `BillTemplate` is a free-text nullable string that shows as a gray badge on the Bills page but is otherwise unused. This change promotes it to a required enum with 9 predefined values and makes it structural: bills and payments are grouped by category with section headers, giving the user a meaningful at-a-glance view of their spending by area.

## Starting Point

The DB column is `VARCHAR(100) NULL`; the form uses an HTML5 `<datalist>` combobox; the Bills page is a flat alphabetical list; the Payments page has no category awareness at all. `PaymentInstanceOut` carries no `category` field, though the payments router already eager-loads the template.

## Desired End State

Bills page shows bills grouped under category headers (`Utilities · 3 bills`), sorted A–Z within each group. Archived bills page mirrors the same layout. Payments page shows payment rows under plain category-name dividers. The bill form has a `<select>` with 9 options and a required validation error if none is chosen. Category labels are translated across EN, PL, and DE.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Category vocabulary | Fixed predefined list of 9 | No user-managed categories — keeps the model simple, avoids a categories table | Plan |
| Required vs optional | Required (NOT NULL) | Ensures clean grouped views with no "Uncategorized" fallback group | Plan |
| Payment grouping UX | Fixed section headers (non-collapsible) | Less state, simpler render, matches bills page style | Plan |
| Within-group sort | Alphabetical by bill name | Consistent with existing global sort order | Plan |
| Category header | Label + bill count | More informative at a glance; count is cheap to compute | Plan |
| Migration data path | `UPDATE nulls → 'other'` then `NOT NULL` | Safe for any non-empty DB; dev env uses volume wipe (`down -v`) | Plan |
| Backup restore | Map unknowns to `"other"` silently | Restore must not break on pre-enum backups | Plan |
| Migration authoring | Handwritten (not autogenerate) | Per lessons.md — autogenerate silently misses type/nullability changes | Lessons |

## Scope

**In scope:**
- `BillCategory` Python enum + SQLAlchemy column change
- Alembic migration (handwritten)
- Schema update across `BillTemplateCreate/Out`, `PaymentInstanceOut`, `BackupTemplate`
- `CategorySelect` component (replaces `CategoryCombobox`)
- Required category validation in `BillTemplateForm`
- Remove `categorySuggestions` prop chain (page → row → form)
- Grouped renders: Bills page, Archived Bills page, Payments page
- `lib/categories.ts` shared constant
- i18n: `"Categories"` namespace in EN, PL, DE

**Out of scope:**
- User-managed categories (add/rename/delete), no `categories` table
- Collapsible category sections
- Category filter/search
- XLSX export changes (already writes a Category column)
- Category badge on individual payment rows

## Architecture / Approach

Backend-first: define the enum in the model, update all schemas, write the migration manually, then expose `category` on the payments response. Frontend plumbing second: update TS types, replace the combobox, validate the form. Layout last: group the three list pages and add i18n. This ordering ensures the API is correct before any layout work begins.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend | Enum, schema, migration, payments router, restore coercion | Migration must be handwritten — autogenerate is unreliable here |
| 2. Frontend types + select + form | Typed `<select>`, required validation, prop cleanup | Removing `categorySuggestions` from three component layers without missing a callsite |
| 3. Grouped layouts + i18n | Category headers on Bills, Archived, Payments pages; translated labels | Getting `CATEGORY_ORDER` iteration right so groups appear in the same order everywhere |

**Prerequisites:** None — this is a self-contained change.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Alembic `alter_column` with `existing_type=sa.String(100)` is required for PostgreSQL — omitting it may silently no-op (per lessons.md).
- Any existing backup JSON files with free-text category values will have those bills moved to "Other" on restore. This is intentional and communicated to the user.

## Success Criteria (Summary)

- Bills page displays bills in 9 category groups (or fewer if some are empty) with translated headers and A–Z sort within each group.
- Payments page displays payments under category section dividers matching the same order.
- `POST /bills` without a `category` field returns 422; the form shows a validation error inline.