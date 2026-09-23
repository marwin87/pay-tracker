"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: ReactNode;
}

const FIELD_TRIGGER_CLASS =
  "flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors hover:border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:border-green-600 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const PILL_TRIGGER_CLASS =
  "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white pl-3 pr-2.5 py-1.5 text-sm font-medium text-slate-600 shadow-sm outline-none transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:focus:border-green-600 dark:focus:ring-green-900/40 cursor-pointer";

const PILL_SM_TRIGGER_CLASS = PILL_TRIGGER_CLASS.replace("text-sm", "text-xs");

const TRIGGER_VARIANTS = {
  field: FIELD_TRIGGER_CLASS,
  pill: PILL_TRIGGER_CLASS,
  "pill-sm": PILL_SM_TRIGGER_CLASS,
};

const OPTION_TEXT_SIZE: Record<keyof typeof TRIGGER_VARIANTS, string> = {
  field: "text-sm",
  pill: "text-sm",
  "pill-sm": "text-xs",
};

interface Props<T extends string> {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  ariaLabel?: string;
  placeholder?: ReactNode;
  variant?: keyof typeof TRIGGER_VARIANTS;
  scrollable?: boolean;
}

export default function Dropdown<T extends string>({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  variant = "field",
  scrollable,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  function handleSelect(v: T) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={TRIGGER_VARIANTS[variant]}
      >
        <span className="flex-1 truncate text-left">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-slate-400 dark:text-slate-500" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1.5 min-w-full w-max max-w-xs rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          <div className={scrollable ? "max-h-64 overflow-y-auto" : undefined}>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => handleSelect(opt.value)}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left ${OPTION_TEXT_SIZE[variant]} transition-colors ${
                  opt.value === value
                    ? "bg-green-700 font-semibold text-white"
                    : "text-slate-700 hover:bg-green-50 hover:text-green-800 dark:text-slate-300 dark:hover:bg-green-900/30 dark:hover:text-green-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
