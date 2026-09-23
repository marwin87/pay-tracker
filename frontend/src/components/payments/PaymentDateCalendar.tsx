"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";

interface Props {
  value: string; // "YYYY-MM-DD"
  onChange: (date: string) => void;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Monday-first offset (0=Mon … 6=Sun)
function firstDayOffset(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1;
}

export default function PaymentDateCalendar({ value, onChange }: Props) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth() + 1); // 1–12
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrentViewMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
  const isFutureViewMonth =
    viewYear > today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth > today.getMonth() + 1);

  function prevMonth() {
    setViewMonth((m) => {
      if (m === 1) {
        setViewYear((y) => y - 1);
        return 12;
      }
      return m - 1;
    });
  }
  function nextMonth() {
    if (isCurrentViewMonth || isFutureViewMonth) return;
    setViewMonth((m) => {
      if (m === 12) {
        setViewYear((y) => y + 1);
        return 1;
      }
      return m + 1;
    });
  }

  function handleSelectDay(d: number) {
    onChange(toISODate(new Date(viewYear, viewMonth - 1, d)));
    setOpen(false);
  }

  const fmt = (y: number, m: number) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
      new Date(y, m - 1, 1),
    );

  const triggerLabel = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(selected);

  // Short weekday headers starting Monday
  const weekdayHeaders = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" })
      .format(new Date(2024, 0, 6 + i)) // Jan 6 2024 = Monday
      .slice(0, 2),
  );

  const maxDay = daysInMonth(viewYear, viewMonth);
  const offset = firstDayOffset(viewYear, viewMonth);

  function handleOpen() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popupHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < popupHeight + 8;
    setPopupStyle(
      openUpward
        ? { position: "fixed", bottom: window.innerHeight - rect.top + 6, left: rect.left, width: 288, zIndex: 9999 }
        : { position: "fixed", top: rect.bottom + 6, left: rect.left, width: 288, zIndex: 9999 }
    );
    setViewYear(selected.getFullYear());
    setViewMonth(selected.getMonth() + 1);
    setOpen((o) => !o);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors hover:border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:border-green-600 dark:focus:border-green-600 dark:focus:ring-green-900/40"
      >
        <CalendarDays size={15} className="shrink-0 text-slate-400 dark:text-slate-500" />
        <span className="capitalize">{triggerLabel}</span>
      </button>

      {open && createPortal(
        <div ref={containerRef} style={popupStyle} className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {/* Month navigation */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">
              {fmt(viewYear, viewMonth)}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              disabled={isCurrentViewMonth}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="mb-1 grid grid-cols-7">
            {weekdayHeaders.map((wd, i) => (
              <div
                key={i}
                className="flex h-7 items-center justify-center text-xs font-medium text-slate-400 dark:text-slate-500 capitalize"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: offset }).map((_, i) => (
              <div key={`gap-${i}`} />
            ))}
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => {
              const cellDate = new Date(viewYear, viewMonth - 1, d);
              const isFuture = cellDate.getTime() > today.getTime();
              const isSelected = toISODate(cellDate) === value;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={isFuture}
                  onClick={() => handleSelectDay(d)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
                    isSelected
                      ? "bg-green-700 font-semibold text-white"
                      : isFuture
                        ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                        : "text-slate-700 hover:bg-green-50 hover:text-green-800 dark:text-slate-300 dark:hover:bg-green-900/30 dark:hover:text-green-300"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
