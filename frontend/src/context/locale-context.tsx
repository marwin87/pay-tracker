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

export type Locale = "en" | "pl" | "de";

const messagesMap: Record<Locale, typeof enMessages> = {
  en: enMessages,
  pl: plMessages,
  de: deMessages,
};

const VALID_LOCALES: Locale[] = ["en", "pl", "de"];

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language;
  if (lang.startsWith("pl")) return "pl";
  if (lang.startsWith("de")) return "de";
  return "en";
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(detectBrowserLocale);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    fetchMe()
      .then((profile) => {
        if (
          !cancelled &&
          profile.language_preference &&
          VALID_LOCALES.includes(profile.language_preference as Locale)
        ) {
          setLocaleState(profile.language_preference as Locale);
        }
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

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
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
