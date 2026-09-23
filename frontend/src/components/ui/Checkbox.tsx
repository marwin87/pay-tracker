"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

type CheckboxColor = "green" | "red";
type CheckboxSize = "sm" | "md";

const COLOR_CLASS: Record<CheckboxColor, string> = {
  green:
    "peer-checked:border-green-700 peer-checked:bg-green-700 dark:peer-checked:border-green-600 dark:peer-checked:bg-green-600",
  red: "peer-checked:border-red-600 peer-checked:bg-red-600 dark:peer-checked:border-red-500 dark:peer-checked:bg-red-500",
};

const SIZE_CLASS: Record<CheckboxSize, { box: string; icon: number }> = {
  sm: { box: "h-3.5 w-3.5", icon: 10 },
  md: { box: "h-4 w-4", icon: 12 },
};

interface CheckboxMarkProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: CheckboxColor;
  size?: CheckboxSize;
}

/** The bare checkbox control (hidden native input + custom visual box). Use
 * this directly when the surrounding label/text layout doesn't fit the
 * convenience `Checkbox` wrapper below (see MultiSelectFilter.tsx). */
export function CheckboxMark({
  checked,
  onChange,
  disabled,
  color = "green",
  size = "md",
}: CheckboxMarkProps) {
  const { box, icon } = SIZE_CLASS[size];
  return (
    <span className={`relative inline-flex shrink-0 ${box}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        className={`${box} rounded border border-slate-300 bg-white transition-colors dark:border-slate-600 dark:bg-slate-700 peer-focus-visible:ring-2 peer-focus-visible:ring-green-500 peer-focus-visible:ring-offset-1 peer-disabled:opacity-50 ${COLOR_CLASS[color]}`}
      />
      <Check
        size={icon}
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto text-white opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  );
}

interface CheckboxProps extends CheckboxMarkProps {
  label: ReactNode;
  align?: "center" | "start";
}

/** Checkbox + label, for the common case of a single-line (or wrapping)
 * option in a settings list or form. */
export function Checkbox({ label, align = "center", ...markProps }: CheckboxProps) {
  return (
    <label
      className={`flex gap-2 ${align === "start" ? "items-start" : "items-center"} ${
        markProps.disabled ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span className={align === "start" ? "mt-0.5" : undefined}>
        <CheckboxMark {...markProps} />
      </span>
      <span className="text-sm text-slate-700 dark:text-slate-300 select-none">{label}</span>
    </label>
  );
}
