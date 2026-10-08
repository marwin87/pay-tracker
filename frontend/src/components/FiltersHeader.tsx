"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

/** Toolbar title with a "Reset filters" button that shows only while a filter is active. */
export default function FiltersHeader({ activeCount, onReset }: { activeCount: number; onReset: () => void }) {
  const t = useTranslations("Filters");
  return (
    <div className="-mb-1 flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{t("toolbarTitle")}</p>
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-slate-700 hover:underline dark:text-slate-200"
        >
          <RotateCcw size={14} />
          {t("resetFilters")}
          <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums dark:bg-slate-700">{activeCount}</span>
        </button>
      )}
    </div>
  );
}
