"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { NextIntlClientProvider } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { fetchMe, updateMe } from "@/lib/user-api";
import enMessages from "../../messages/en.json";
import plMessages from "../../messages/pl.json";
import deMessages from "../../messages/de.json";
import esMessages from "../../messages/es.json";
import itMessages from "../../messages/it.json";
import frMessages from "../../messages/fr.json";
import zhMessages from "../../messages/zh.json";

export type Locale = "en" | "pl" | "de" | "es" | "it" | "fr" | "zh";

const messagesMap: Record<Locale, typeof enMessages> = {
  en: enMessages,
  pl: plMessages,
  de: deMessages,
  es: esMessages,
  it: itMessages,
  fr: frMessages,
  zh: zhMessages,
};

const VALID_LOCALES: Locale[] = ["en", "pl", "de", "es", "it", "fr", "zh"];

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language;
  if (lang.startsWith("pl")) return "pl";
  if (lang.startsWith("de")) return "de";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("it")) return "it";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  enabledLocales: Locale[];
  setEnabledLocales: (langs: Locale[]) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(detectBrowserLocale);
  const [enabledLocales, setEnabledLocalesState] = useState<Locale[]>(VALID_LOCALES);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    fetchMe()
      .then((profile) => {
        if (cancelled) return;
        if (
          profile.language_preference &&
          VALID_LOCALES.includes(profile.language_preference as Locale)
        ) {
          setLocaleState(profile.language_preference as Locale);
        } else if (!profile.language_preference) {
          // Persist the browser-detected locale so backend emails use the right language
          updateMe({ language_preference: detectBrowserLocale() }).catch(() => {});
        }
        const enabled = (profile.enabled_languages ?? []).filter((l): l is Locale =>
          VALID_LOCALES.includes(l as Locale),
        );
        setEnabledLocalesState(enabled.length ? enabled : VALID_LOCALES);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      if (isAuthenticated) {
        updateMe({ language_preference: l }).catch(() => {
          // persist failure is non-fatal
        });
      }
    },
    [isAuthenticated],
  );

  const setEnabledLocales = useCallback(
    (langs: Locale[]) => {
      setEnabledLocalesState(langs);
      if (isAuthenticated) {
        updateMe({ enabled_languages: langs }).catch(() => {
          // persist failure is non-fatal
        });
      }
    },
    [isAuthenticated],
  );

  return (
    <LocaleContext.Provider
      value={{ locale, setLocale, enabledLocales, setEnabledLocales }}
    >
      <NextIntlClientProvider locale={locale} messages={messagesMap[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
