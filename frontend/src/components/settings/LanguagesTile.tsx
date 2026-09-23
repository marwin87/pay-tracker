"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale, type Locale } from "@/context/locale-context";
import { Tile } from "./Tile";

const LOCALES: { value: Locale; flag: string; name: string }[] = [
  { value: "en", flag: "🇬🇧", name: "English" },
  { value: "pl", flag: "🇵🇱", name: "Polski" },
  { value: "de", flag: "🇩🇪", name: "Deutsch" },
  { value: "es", flag: "🇪🇸", name: "Español" },
  { value: "it", flag: "🇮🇹", name: "Italiano" },
  { value: "fr", flag: "🇫🇷", name: "Français" },
  { value: "zh", flag: "🇨🇳", name: "中文" },
];

export function LanguagesTile({
  t,
  isCollapsed,
  onToggle,
}: {
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tp = useTranslations("SettingsPage");
  const { locale, enabledLocales, setEnabledLocales } = useLocale();

  function handleChange(value: Locale, checked: boolean) {
    const next = checked
      ? [...enabledLocales, value]
      : enabledLocales.filter((l) => l !== value);
    setEnabledLocales(next);
  }

  return (
    <Tile
      color="blue"
      icon={Languages}
      title={tp("languages.title")}
      description={tp("languages.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <div className="space-y-2">
        {LOCALES.map(({ value, flag, name }) => {
          const isActive = value === locale;
          return (
            <label
              key={value}
              className={`flex items-center ${isActive ? "opacity-50" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={enabledLocales.includes(value)}
                disabled={isActive}
                onChange={(e) => handleChange(value, e.target.checked)}
                className="h-4 w-4 rounded border-slate-200 accent-green-700 focus:ring-green-500 dark:border-slate-600"
              />
              <span className="ml-2 text-sm text-slate-700 dark:text-slate-300">
                {flag} {name}
                {isActive && ` ${tp("languages.activeSuffix")}`}
              </span>
            </label>
          );
        })}
      </div>
    </Tile>
  );
}
