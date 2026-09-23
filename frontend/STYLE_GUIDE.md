# Frontend Style Guide

Concrete Tailwind conventions for pay-tracker's UI, extracted from existing components. The rule that caused the most trouble so far: **a new element that looks different from its neighbors is a bug, even if nothing is functionally broken.** Copy an existing pattern; don't improvise one.

## Before you write a single className

1. Find the closest existing component doing the same job (see the table below) and copy its class string verbatim — colors, radius, spacing, dark: variants, all of it.
2. If nothing close exists, compose from the tables below rather than inventing new colors/radii.
3. Check every color utility (`border-*`, `bg-*`, `text-*`) has a `dark:` counterpart. A class list with light-mode color and no dark-mode pair is wrong by default, not an edge case.
4. If it's a modal/popup, render via `createPortal(..., document.body)` — never inline. (Project rule; `DeletePaymentDialog.tsx` and the payment dialogs are known, not-to-be-copied exceptions.)
5. Actually look at it — run the app, toggle dark mode, compare side-by-side with a sibling component before calling it done.

## Buttons

There are five button shapes in this app. Pick the one matching the button's *role*, not its color.

| Role | Reference component | Shape |
|---|---|---|
| Neutral trigger (opens a dialog from static content) | `BackupButton.tsx`, `RestoreButton.tsx` | outline, muted at rest, tints on hover |
| Save (commit a dirty form field) | `ProfileTile.tsx`, `CurrencyTile.tsx` (`btnSave`) | outline emerald |
| Cancel (discard a dirty field / dismiss a dialog) | same files (`btnCancel`) | outline slate |
| Dialog confirm — destructive | `DeletePaymentDialog.tsx`, `RestoreButton.tsx` confirm | outline red, full dark-mode |
| Dialog confirm — positive/neutral | `BackupButton.tsx` confirm | outline green |

**Neutral trigger button** (e.g. "Backup", "Restore", "Delete account" tile buttons):
```
flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-{accent}-300 hover:bg-{accent}-50 hover:text-{accent}-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-{accent}-700 dark:hover:bg-{accent}-900/20 dark:hover:text-{accent}-400
```
`{accent}` = the semantic color of the action (green for backup/restore, red for delete). Icon at `size={18}` before the label. **Never** a solid filled button for this role — every static, always-visible trigger in this app is muted-at-rest.

**Save button:**
```
rounded-lg border border-emerald-200 bg-white px-4 py-1.5 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300
```

**Cancel button:**
```
rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200
```
(in a modal footer: swap `px-4 py-1.5` for `flex-1 py-2.5`)

**Dialog confirm — destructive:**
```
flex-1 rounded-lg border border-red-200 bg-white py-2.5 text-sm font-medium text-red-600 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-red-800 dark:bg-slate-800 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-300
```
Swap `red` for `green`/`emerald` for a positive confirm (see `BackupButton.tsx`).

> **Known deviation, don't copy:** `ArchiveConfirmDialog.tsx`'s confirm button is a solid filled `bg-red-600` with no dark-mode variants. It predates the outline convention above and hasn't been fixed yet. If you're touching that file anyway, align it; otherwise leave it and use the outline pattern for anything new.

**Loading/disabled state:** swap the label, don't add a separate spinner-only state, unless the action is a genuinely slow async op (file download/upload), in which case use `Loader2` from `lucide-react` at `size={14}` with `animate-spin`, `gap-2`, inside a `flex items-center justify-center` button (see `BackupButton.tsx`/`RestoreButton.tsx` confirm buttons). Always pair with `disabled:opacity-50` and `disabled={pending}`.

## Modals / confirm dialogs

Every popup follows this exact shell (`ArchiveConfirmDialog.tsx`, `DeleteAccountDialog.tsx`, `RestoreButton.tsx`'s inline dialog):

```tsx
createPortal(
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="{name}-dialog-title"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-{color}-100 text-{color}-600 dark:bg-{color}-900/30 dark:text-{color}-400">
        <Icon size={22} />
      </div>
      <h2 id="{name}-dialog-title" className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">…</h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">…</p>
      {/* optional inline error: */}
      <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">…</p>
      <div className="flex gap-3">{/* Cancel (autoFocus) + Confirm, both flex-1 */}</div>
    </div>
  </div>,
  document.body
)
```

Non-negotiables: `createPortal(..., document.body)` (never inline — see memory rule), `role="dialog"`/`aria-modal`/`aria-labelledby`, Escape closes via `onCancel`, first button (Cancel) gets `autoFocus`.

**Component gotcha:** the icon+title+description block at the top of a dialog (and of a `Tile`, see below) is *not* just decoration — it's inside interactive/labelled elements whose accessible name is the concatenation of all its text. If you add a trigger button with the same label text nearby, e2e role-based locators (`getByRole('button', { name: ... })`) will match both and need `{ exact: true }`. Keep dialog/tile title text short and distinct from trigger button labels where you can, and use `exact: true` in tests regardless.

## Settings tiles

Always use the shared `Tile` component (`frontend/src/components/settings/Tile.tsx`) for anything on the Settings page — never hand-roll a card. Pick a color by semantics:

| Color | Meaning | Example |
|---|---|---|
| `blue` | identity / account info | Profile |
| `green` | positive data actions | Currency, Backup |
| `yellow` | reserved (not yet used) | — |
| `red` | destructive or overwrite-risk actions | Restore (overwrites data), Delete account |

In practice, every real tile renders its own local `save`/`cancel` buttons as children (outline emerald/slate, see Buttons above) rather than using `Tile`'s built-in `isDirty`/`onSave`/`onCancel` props — that prop path exists but isn't the pattern actually in use. Follow `CurrencyTile.tsx`/`ProfileTile.tsx`, not `Tile.tsx`'s internal solid-green fallback button.

Note `Tile`'s header (icon + title + description) always renders as a `<button>`, even when the tile has no `onToggle` (non-collapsible) — see the gotcha above.

`Tile.tsx` rounds its header/content corners via `rounded-t-xl`/`rounded-b-xl` on those individual elements, not `overflow-hidden` on the outer wrapper — that wrapper used to have `overflow-hidden` for the same corner-clipping purpose, but it silently clipped any `Dropdown` popup rendered inside the tile the moment it overflowed past the tile's edge. Don't reintroduce `overflow-hidden` there.

## Inputs

```
w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40
```
Focus ring is always green regardless of the tile's color — don't theme it per-tile.

## Checkboxes

**Never use a bare `accent-*` checkbox.** The `accent-color` CSS property still renders the browser/OS-native checkbox shape underneath — sized and shaped differently across browsers — and looks inconsistent with everything else. Every checkbox uses the shared component in `frontend/src/components/ui/Checkbox.tsx`, built the same way as `Switch.tsx`: a visually-hidden native `<input type="checkbox">` (`sr-only peer`) driving a fully custom `peer-checked:`-styled box + `lucide-react` `Check` icon, so it stays keyboard/screen-reader accessible without inheriting native rendering.

```tsx
<Checkbox checked={value} onChange={setValue} label="…" />              // label + box, the common case
<Checkbox checked={value} onChange={setValue} label="…" color="red" align="start" />  // destructive dialog, multi-line label
<CheckboxMark checked={value} onChange={setValue} size="sm" />          // bare box only — you already have your own <label>/layout (see MultiSelectFilter.tsx)
```

- `color`: `green` (default) or `red` — same semantics as the button color guide (red = destructive action, e.g. `DeletePaymentDialog.tsx`'s "also delete future entries").
- `align`: `center` (default, single-line label) or `start` (label wraps to multiple lines — aligns the box to the first line, see `DeletePaymentDialog.tsx`).
- `size` (on `CheckboxMark` only): `md` (default, `h-4 w-4`) or `sm` (`h-3.5 w-3.5`, for dense contexts like the `MultiSelectFilter.tsx` popup).

## Dropdowns

**Never use a native `<select>`.** The open popup renders with OS-native styling that can't be themed and looks inconsistent with the rest of the app. Every dropdown in this app — including any list of choices, not just form fields — uses the shared `Dropdown` component (`frontend/src/components/ui/Dropdown.tsx`), which generalizes the custom popup pattern originally built for `DayPicker.tsx` (click-outside/Escape to close, `role="listbox"`/`role="option"`, green hover/selected states).

```tsx
<Dropdown
  value={value}
  onChange={setValue}
  options={[{ value: "a", label: "A" }, ...]}
  ariaLabel="…"        // or pass `id` + an associated <label htmlFor>
  variant="field"        // "field" | "pill" | "pill-sm"
  scrollable              // for long option lists (time slots, categories)
/>
```

Pick `variant` by context, matching the reference components:

| Variant | Shape | Reference |
|---|---|---|
| `field` (default) | full-width form field, `rounded-xl` | `CategoryCombobox.tsx`, `CurrencyPicker.tsx` |
| `pill` | compact rounded pill, `text-sm` | `LanguageToggle.tsx`, the reminder-time picker in `EmailNotificationsTile.tsx` |
| `pill-sm` | same pill, `text-xs` | `FilterSelect.tsx` (Sort by / Filter by) — don't use plain `pill` here, it was already tried and produced visibly oversized filter dropdowns |

`options[].value` must be `string` — for a numeric or union-typed value (category id, currency code with a "custom" fallback), convert at the call site (`String(id)` in, `Number(v)` out) rather than extending the component's generic. See `CategoryCombobox.tsx` for the pattern.

**Gotcha inherited from the `overflow-hidden` corner-clipping trick** (see Settings tiles above and `BillTemplateRow.tsx`): never put `overflow-hidden` on a container that has a `Dropdown` (or any absolutely-positioned popup) inside it, even indirectly — it silently clips the open popup at the container's edge instead of erroring. If a container needs rounded corners clipped, round the specific child elements that have their own background (`rounded-t-xl`/`rounded-b-xl`) instead of the whole box.

## Text colors

| Use | Classes |
|---|---|
| Page/section heading | `text-slate-800 dark:text-slate-100` (+ `font-semibold`) |
| Body / description | `text-slate-500 dark:text-slate-400` |
| Muted hint / metadata | `text-slate-400 dark:text-slate-500` |
| Form label | `text-slate-700 dark:text-slate-300` (+ `font-medium`) |
| Error message | `text-red-600 dark:text-red-400` |
| Warning banner text | `text-amber-800 dark:text-amber-400` on `bg-amber-50 dark:bg-amber-900/20` |

## Border radius scale

- `rounded-lg` — default for buttons, inputs, inline callout/error banners.
- `rounded-xl` — small alert boxes in a couple of older dialogs (`DeletePaymentDialog.tsx`); `rounded-lg` is preferred for new code, both read as correct.
- `rounded-2xl` — modal/dialog containers only.
- `rounded-full` — circular icon badges (dialog headers), pills.

## Dark mode

Every color utility ships with a `dark:` pair. There is no "I'll add dark mode later" — a class list missing it is an incomplete diff, not a follow-up. When in doubt, copy the dark: variants from the nearest reference component rather than guessing a shade.
