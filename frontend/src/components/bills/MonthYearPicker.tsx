"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale } from "next-intl";

interface Props {
  id?: string;
  value: string; // "YYYY-MM" or "" when unset
  min?: string; // "YYYY-MM" — earlier months are disabled
  onChange: (value: string) => void;
}

// Same look as MonthDayCalendar, but picks a month + year (no day) and can be cleared.
export default function MonthYearPicker({ id, value, min, onChange }: Props) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
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

  const minYear = min ? Number(min.slice(0, 4)) : -Infinity;
  const [selYear, selMonth] = value ? value.split("-").map(Number) : [0, 0];

  const monthName = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2024, m - 1, 1));

  const triggerLabel = value
    ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
        new Date(selYear, selMonth - 1, 1),
      )
    : "---";

  function handleOpen() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popupHeight = 220;
    const openUpward = window.innerHeight - rect.bottom < popupHeight + 8;
    setPopupStyle(
      openUpward
        ? { position: "fixed", bottom: window.innerHeight - rect.top + 6, left: rect.left, width: 288, zIndex: 9999 }
        : { position: "fixed", top: rect.bottom + 6, left: rect.left, width: 288, zIndex: 9999 },
    );
    setViewYear(value ? selYear : new Date().getFullYear());
    setOpen((o) => !o);
  }

  function select(m: number) {
    onChange(`${viewYear}-${String(m).padStart(2, "0")}`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        id={id}
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
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X size={14} />
        </button>
      )}

      {open && createPortal(
        <div ref={containerRef} style={popupStyle} className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              disabled={viewYear <= minYear}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const selected = viewYear === selYear && m === selMonth;
              const disabled = !!min && `${viewYear}-${String(m).padStart(2, "0")}` < min;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => select(m)}
                  disabled={disabled}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm capitalize transition-colors disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:disabled:text-slate-600 ${
                    selected
                      ? "bg-green-700 font-semibold text-white"
                      : "text-slate-700 hover:bg-green-50 hover:text-green-800 dark:text-slate-300 dark:hover:bg-green-900/30 dark:hover:text-green-300"
                  }`}
                >
                  {monthName(m)}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
