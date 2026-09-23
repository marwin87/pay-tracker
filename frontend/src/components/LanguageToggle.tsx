"use client";

import { useTranslations } from "next-intl";
import { useLocale, type Locale } from "@/context/locale-context";
import Dropdown from "@/components/ui/Dropdown";

const LOCALES: { value: Locale; flag: string; name: string }[] = [
  { value: "en", flag: "🇬🇧", name: "English" },
  { value: "pl", flag: "🇵🇱", name: "Polski" },
  { value: "de", flag: "🇩🇪", name: "Deutsch" },
  { value: "es", flag: "🇪🇸", name: "Español" },
  { value: "it", flag: "🇮🇹", name: "Italiano" },
  { value: "fr", flag: "🇫🇷", name: "Français" },
  { value: "zh", flag: "🇨🇳", name: "中文" },
];

export default function LanguageToggle() {
  const t = useTranslations("LanguageToggle");
  const { locale, setLocale, enabledLocales } = useLocale();

  const options = LOCALES.filter(({ value }) => enabledLocales.includes(value)).map(
    ({ value, flag, name }) => ({
      value,
      label: (
        <>
          {flag} {name}
        </>
      ),
    }),
  );

  return (
    <Dropdown
      variant="pill"
      value={locale}
      onChange={(v) => setLocale(v as Locale)}
      options={options}
      ariaLabel={t("ariaLabel")}
    />
  );
}
