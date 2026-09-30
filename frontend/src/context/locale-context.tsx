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
import { LOCALES, messagesMap, detectBrowserLocale, type Locale } from "@/lib/locales";

export type { Locale };

export type DecimalSeparator = "." | ",";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  enabledLocales: Locale[];
  setEnabledLocales: (langs: Locale[]) => void;
  decimalSeparator: DecimalSeparator;
  setDecimalSeparator: (s: DecimalSeparator) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(detectBrowserLocale);
  const [enabledLocales, setEnabledLocalesState] = useState<Locale[]>(LOCALES);
  const [decimalSeparator, setDecimalSeparatorState] = useState<DecimalSeparator>(".");

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    fetchMe()
      .then((profile) => {
        if (cancelled) return;
        if (
          profile.language_preference &&
          LOCALES.includes(profile.language_preference as Locale)
        ) {
          setLocaleState(profile.language_preference as Locale);
        } else if (!profile.language_preference) {
          // Persist the browser-detected locale so backend emails use the right language
          updateMe({ language_preference: detectBrowserLocale() }).catch(() => {});
        }
        const enabled = (profile.enabled_languages ?? []).filter((l): l is Locale =>
          LOCALES.includes(l as Locale),
        );
        setEnabledLocalesState(enabled.length ? enabled : LOCALES);
        setDecimalSeparatorState(profile.decimal_separator);
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

  const setDecimalSeparator = useCallback(
    (s: DecimalSeparator) => {
      setDecimalSeparatorState(s);
      if (isAuthenticated) {
        updateMe({ decimal_separator: s }).catch(() => {
          // persist failure is non-fatal
        });
      }
    },
    [isAuthenticated],
  );

  return (
    <LocaleContext.Provider
      value={{
        locale,
        setLocale,
        enabledLocales,
        setEnabledLocales,
        decimalSeparator,
        setDecimalSeparator,
      }}
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
