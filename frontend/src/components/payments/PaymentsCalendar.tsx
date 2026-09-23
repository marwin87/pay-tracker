"use client";

import { useLocale } from "next-intl";
import type { PaymentInstanceOut } from "@/lib/payments-api";

interface Props {
  year: number;
  month: number; // 1–12
  instances: PaymentInstanceOut[];
  todayStr: string;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}

type DotStatus = "overdue" | "dueToday" | "upcoming" | "paid";

const STATUS_TILE: Record<DotStatus, string> = {
  overdue: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50",
  dueToday: "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50",
  upcoming: "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50",
  paid: "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Monday-first offset (0=Mon … 6=Sun)
function firstDayOffset(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1;
}

function dayStatus(
  dayInstances: PaymentInstanceOut[],
  dateStr: string,
  todayStr: string,
): DotStatus | null {
  if (dayInstances.length === 0) return null;
  if (dayInstances.some((i) => i.status === "overdue")) return "overdue";
  if (dayInstances.some((i) => i.status === "upcoming")) {
    return dateStr === todayStr ? "dueToday" : "upcoming";
  }
  return "paid";
}

export default function PaymentsCalendar({
  year,
  month,
  instances,
  todayStr,
  selectedDay,
  onSelectDay,
}: Props) {
  const locale = useLocale();

  // Short weekday headers starting Monday (year-agnostic, only the label matters)
  const weekdayHeaders = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" })
      .format(new Date(2024, 0, 6 + i)) // Jan 6 2024 = Monday
      .slice(0, 2),
  );

  const maxDay = daysInMonth(year, month);
  const offset = firstDayOffset(year, month);

  const byDay = new Map<string, PaymentInstanceOut[]>();
  for (const inst of instances) {
    const list = byDay.get(inst.due_date);
    if (list) list.push(inst);
    else byDay.set(inst.due_date, [inst]);
  }

  return (
    <div>
      <div className="mb-1 grid grid-cols-7">
        {weekdayHeaders.map((wd, i) => (
          <div
            key={i}
            className="flex h-5 items-center justify-center text-[11px] font-medium text-slate-400 dark:text-slate-500 capitalize"
          >
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`gap-${i}`} />
        ))}
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => {
          const dateStr = `${year}-${pad(month)}-${pad(d)}`;
          const dayInstances = byDay.get(dateStr) ?? [];
          const status = dayStatus(dayInstances, dateStr, todayStr);
          const isSelected = selectedDay === dateStr;
          const isToday = dateStr === todayStr;
          const hasBills = dayInstances.length > 0;
          return (
            <button
              key={d}
              type="button"
              disabled={!hasBills}
              onClick={() => onSelectDay(dateStr)}
              className={`relative flex h-8 items-center justify-center rounded-lg text-xs font-medium transition-all ${
                status
                  ? `${STATUS_TILE[status]} cursor-pointer hover:-translate-y-0.5 hover:shadow-sm`
                  : "cursor-default border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500"
              } ${
                isSelected
                  ? "ring-2 ring-green-600 dark:ring-emerald-400"
                  : isToday
                  ? "ring-2 ring-inset ring-slate-500 dark:ring-slate-300"
                  : ""
              } ${isToday ? "font-bold" : ""}`}
            >
              {d}
              {dayInstances.length > 1 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-white bg-slate-600 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm dark:border-slate-800 dark:bg-slate-300 dark:text-slate-800">
                  {dayInstances.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
