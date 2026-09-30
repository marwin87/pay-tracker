"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "@/context/locale-context";
import { LOCALE_OPTIONS, type Locale } from "@/lib/locales";
import { CheckboxMark } from "@/components/ui/Checkbox";
import { Tile } from "./Tile";

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
      color="purple"
      icon={Languages}
      title={tp("languages.title")}
      description={tp("languages.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <div className="space-y-2">
        {LOCALE_OPTIONS.map(({ code: value, flag, name }) => {
          const isActive = value === locale;
          return (
            <label
              key={value}
              className={`flex items-center ${isActive ? "opacity-50" : "cursor-pointer"}`}
            >
              <CheckboxMark
                checked={enabledLocales.includes(value)}
                disabled={isActive}
                onChange={(checked) => handleChange(value, checked)}
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
