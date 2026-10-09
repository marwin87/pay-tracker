"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { shiftMonth } from "@/lib/summary";

export const NAV_BTN =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-green-500 hover:bg-green-50 hover:text-green-800 disabled:pointer-events-none disabled:opacity-30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-green-600 dark:hover:bg-green-900/30 dark:hover:text-green-300";

interface Props {
  month: string;
  currentMonth: string;
  /** Earliest month that can be browsed, "YYYY-MM". */
  minMonth: string;
  /** Latest month that can be browsed, "YYYY-MM". */
  maxMonth: string;
  monthLabel: string;
  onChange: (month: string) => void;
}

/** The month card's title with prev/next arrows built in. */
export default function MonthNav({ month, currentMonth, minMonth, maxMonth, monthLabel, onChange }: Props) {
  const t = useTranslations("Dashboard.nav");
  const atCurrent = month === currentMonth;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={NAV_BTN} aria-label={t("prev")} title={t("prev")} disabled={month <= minMonth} onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={22} />
      </button>
      <h2 id="month-summary-title" className="min-w-36 text-center text-lg font-semibold capitalize text-slate-800 dark:text-slate-100 sm:text-xl">
        {monthLabel}
      </h2>
      <button type="button" className={NAV_BTN} aria-label={t("next")} title={t("next")} disabled={month >= maxMonth} onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={22} />
      </button>
      {!atCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonth)}
          className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
        >
          {t("today")}
        </button>
      )}
    </div>
  );
}
