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

## Inputs

```
w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40
```
Same class for `<select>` (drop the `placeholder:` part). Focus ring is always green regardless of the tile's color — don't theme it per-tile.

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
