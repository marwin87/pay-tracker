"use client";

import { useState } from "react";
import { PRESET_CURRENCIES } from "@/lib/currency";

type CurrencyOption = (typeof PRESET_CURRENCIES)[number] | "custom";

interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  customOption: string;
  customCurrencyAriaLabel: string;
  customCurrencyPlaceholder: string;
  selectClassName?: string;
  inputClassName?: string;
}

const defaultSelectClass =
  "w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const defaultInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

export default function CurrencyPicker({
  value,
  onChange,
  ariaLabel,
  customOption,
  customCurrencyAriaLabel,
  customCurrencyPlaceholder,
  selectClassName,
  inputClassName,
}: Props) {
  const isPreset = (PRESET_CURRENCIES as readonly string[]).includes(value);
  const [currencyOption, setCurrencyOption] = useState<CurrencyOption>(
    isPreset ? (value as CurrencyOption) : "custom",
  );
  const [customCurrency, setCustomCurrency] = useState(isPreset ? "" : value);

  function handleOptionChange(option: CurrencyOption) {
    setCurrencyOption(option);
    if (option !== "custom") onChange(option);
    else onChange(customCurrency.trim().toUpperCase());
  }

  function handleCustomChange(v: string) {
    setCustomCurrency(v);
    onChange(v.trim().toUpperCase());
  }

  return (
    <>
      <select
        aria-label={ariaLabel}
        value={currencyOption}
        onChange={(e) => handleOptionChange(e.target.value as CurrencyOption)}
        className={selectClassName ?? defaultSelectClass}
      >
        {PRESET_CURRENCIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
        <option value="custom">{customOption}</option>
      </select>
      {currencyOption === "custom" && (
        <input
          aria-label={customCurrencyAriaLabel}
          value={customCurrency}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder={customCurrencyPlaceholder}
          maxLength={10}
          className={inputClassName ?? defaultInputClass + " basis-full"}
        />
      )}
    </>
  );
}
