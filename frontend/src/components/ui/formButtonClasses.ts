// Shared classNames for the inline Save/Cancel button pairs that dense form
// rows (Settings tiles, bill forms) hand-roll as plain <button> elements
// instead of the <Button> component (whose padding is too large for a
// tight row). Centralized so a style change touches one file, not eight.
export const btnSaveClass =
  "rounded-lg border border-transparent bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50";

export const btnCancelClass =
  "rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200";
