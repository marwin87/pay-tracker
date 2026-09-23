"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { CheckboxMark } from "@/components/ui/Checkbox";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  ariaLabel: string;
  allLabel: string;
}

export default function MultiSelectFilter({ options, selected, onChange, ariaLabel, allLabel }: Props) {
  const t = useTranslations("Filters");
  const [open, setOpen] = useState(false);
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

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  function handleOpen() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popupHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < popupHeight + 8;
    setPopupStyle(
      openUpward
        ? { position: "fixed", bottom: window.innerHeight - rect.top + 6, left: rect.left, minWidth: rect.width, zIndex: 9999 }
        : { position: "fixed", top: rect.bottom + 6, left: rect.left, minWidth: rect.width, zIndex: 9999 }
    );
    setOpen((o) => !o);
  }

  const label =
    selected.size === 0
      ? allLabel
      : selected.size === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? allLabel)
        : t("selectedCount", { count: selected.size });

  return (
    <div className="relative flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white pl-3 pr-2 py-1.5 text-xs font-medium text-slate-600 shadow-sm outline-none transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:focus:border-green-600 dark:focus:ring-green-900/40 cursor-pointer"
      >
        {label}
        <ChevronDown size={14} className="text-slate-400 dark:text-slate-500" />
      </button>

      {open && createPortal(
        <div
          ref={containerRef}
          style={popupStyle}
          className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-green-50 hover:text-green-800 dark:text-slate-300 dark:hover:bg-green-900/30 dark:hover:text-green-300"
            >
              <CheckboxMark
                size="sm"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
