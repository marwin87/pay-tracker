export const PRESET_CURRENCIES = ["EUR", "PLN", "USD", "CNY"] as const;

export const CURRENCY_NAMES: Record<(typeof PRESET_CURRENCIES)[number], string> = {
  EUR: "Euro",
  PLN: "Polish Złoty",
  USD: "US Dollar",
  CNY: "Chinese Yuan",
};

export const LOCALE_DEFAULT_CURRENCY: Record<string, string> = {
  pl: "PLN",
  de: "EUR",
  en: "USD",
  zh: "CNY",
};
