import enMessages from "../../messages/en.json";
import plMessages from "../../messages/pl.json";
import deMessages from "../../messages/de.json";
import esMessages from "../../messages/es.json";
import itMessages from "../../messages/it.json";
import frMessages from "../../messages/fr.json";
import zhMessages from "../../messages/zh.json";
import localeList from "../../messages/locales.json";

// Single source of truth for supported languages: messages/locales.json (also read by
// the backend). Adding a language = a messages/<code>.json, an entry in locales.json,
// and the import + map entry below.
export const messagesMap = {
  en: enMessages,
  pl: plMessages,
  de: deMessages,
  es: esMessages,
  it: itMessages,
  fr: frMessages,
  zh: zhMessages,
};

export type Locale = keyof typeof messagesMap;

export const LOCALE_OPTIONS = localeList as { code: Locale; flag: string; name: string }[];
export const LOCALES: Locale[] = LOCALE_OPTIONS.map((o) => o.code);

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return LOCALES.find((l) => navigator.language.startsWith(l)) ?? "en";
}
