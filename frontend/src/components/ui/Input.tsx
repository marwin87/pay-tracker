"use client";

import { InputHTMLAttributes, ElementType } from "react";
import { PasswordInput } from "./PasswordInput";

type Size = "md" | "lg";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  error?: string;
  /** Optional left-aligned icon (a lucide-react component). */
  icon?: ElementType;
  size?: Size;
}

const SIZE_CLASSES: Record<Size, string> = {
  md: "rounded-xl px-4 py-2.5 text-sm",
  lg: "h-14 rounded-[14px] px-4 text-base",
};

export function Input({ error, icon: Icon, size = "md", className = "", ...props }: InputProps) {
  const Field = props.type === "password" ? PasswordInput : "input";
  const stateClasses = error
    ? "border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-700 dark:focus:border-red-600 dark:focus:ring-red-900/30"
    : "border-slate-200 focus:border-green-500 focus:ring-green-100 dark:border-slate-600 dark:focus:border-green-600 dark:focus:ring-green-900/30";
  const field = (
    <Field
      className={`w-full border bg-white text-slate-800 outline-none transition-colors focus:ring-2 dark:bg-slate-800 dark:text-slate-100 ${stateClasses} ${SIZE_CLASSES[size]} ${Icon ? "pl-11" : ""} ${className}`}
      {...props}
    />
  );
  return (
    <>
      {Icon ? (
        <div className="relative">
          <Icon
            size={21}
            strokeWidth={1.8}
            className="pointer-events-none absolute z-10 left-3.5 top-1/2 -translate-y-1/2 text-[#607268] dark:text-slate-400"
          />
          {field}
        </div>
      ) : (
        field
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </>
  );
}
