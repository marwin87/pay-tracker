"use client";

import { Eye, EyeOff } from "lucide-react";
import { InputHTMLAttributes, useState } from "react";
import { useTranslations } from "next-intl";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Drop-in for `<input type="password">` with a show/hide toggle. Pass your usual input classes via `className`. */
export function PasswordInput({ className = "", ...props }: PasswordInputProps) {
  const t = useTranslations("Common");
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  const label = t(visible ? "hidePassword" : "showPassword");

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-10`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        title={label}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      >
        <Icon className="h-4 w-4" />
      </button>
    </div>
  );
}
