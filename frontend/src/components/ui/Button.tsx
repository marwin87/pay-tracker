"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "border border-green-200 bg-white text-green-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300 disabled:opacity-50",
  secondary:
    "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 disabled:opacity-50",
  danger:
    "border border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:bg-slate-800 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-300 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  loading,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled ?? loading}
      className={`rounded-lg px-5 py-2.5 text-sm font-medium shadow-sm transition-all ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
