"use client";

import { useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale, type Locale } from "@/context/locale-context";
import { MENU_ROW_CLASS } from "@/components/menuRow";

const LOCALES: { value: Locale; flag: string; name: string }[] = [
  { value: "en", flag: "🇬🇧", name: "English" },
  { value: "pl", flag: "🇵🇱", name: "Polski" },
  { value: "de", flag: "🇩🇪", name: "Deutsch" },
  { value: "es", flag: "🇪🇸", name: "Español" },
  { value: "it", flag: "🇮🇹", name: "Italiano" },
  { value: "fr", flag: "🇫🇷", name: "Français" },
  { value: "zh", flag: "🇨🇳", name: "中文" },
];

/** Menu row that expands in place into the user's enabled languages. Stays open after a pick. */
export default function LanguageToggle() {
  const t = useTranslations("LanguageToggle");
  const { locale, setLocale, enabledLocales } = useLocale();
  const [open, setOpen] = useState(false);

  const options = LOCALES.filter(({ value }) => enabledLocales.includes(value));
  const current = LOCALES.find((l) => l.value === locale);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("ariaLabel")}
        className={MENU_ROW_CLASS}
      >
        <Languages size={15} />
        <span>{t("title")}</span>
        <span className="ml-auto flex items-center gap-1 text-xs font-normal text-slate-400 dark:text-slate-500">
          {current?.flag} {current?.name}
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div role="listbox" aria-label={t("ariaLabel")} className="mt-0.5 flex flex-col gap-0.5 pl-3">
          {options.map(({ value, flag, name }) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={value === locale}
              onClick={() => setLocale(value)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                value === locale
                  ? "font-medium text-green-700 dark:text-green-400"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <span>{flag}</span>
              <span>{name}</span>
              {value === locale && <Check size={14} className="ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
