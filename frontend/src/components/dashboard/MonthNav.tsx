"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { shiftMonth } from "@/lib/summary";

const BTN =
  "rounded p-1 text-slate-400 transition-colors hover:text-slate-600 disabled:pointer-events-none disabled:opacity-30 dark:text-slate-500 dark:hover:text-slate-300";

interface Props {
  month: string;
  currentMonth: string;
  /** Earliest month that can be browsed, "YYYY-MM". */
  minMonth: string;
  monthLabel: string;
  onChange: (month: string) => void;
}

/** The month card's title with prev/next arrows built in. */
export default function MonthNav({ month, currentMonth, minMonth, monthLabel, onChange }: Props) {
  const t = useTranslations("Dashboard.nav");
  const atCurrent = month >= currentMonth;
  return (
    <div className="-ml-1 flex flex-wrap items-center gap-x-1">
      <button type="button" className={BTN} aria-label={t("prev")} title={t("prev")} disabled={month <= minMonth} onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={18} />
      </button>
      <h2 id="month-summary-title" className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {monthLabel}
      </h2>
      <button type="button" className={BTN} aria-label={t("next")} title={t("next")} disabled={atCurrent} onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={18} />
      </button>
      {!atCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonth)}
          className="ml-1 text-xs font-medium text-green-700 hover:underline dark:text-emerald-400"
        >
          {t("today")}
        </button>
      )}
    </div>
  );
}
