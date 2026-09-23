"use client";

import { useState } from "react";
import { CURRENCY_NAMES, PRESET_CURRENCIES } from "@/lib/currency";

type CurrencyOption = (typeof PRESET_CURRENCIES)[number] | "custom";

interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  customOption: string;
  customCurrencyAriaLabel: string;
  customCurrencyPlaceholder: string;
  selectClassName: string;
  inputClassName: string;
}

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
        className={selectClassName}
      >
        {PRESET_CURRENCIES.map((c) => (
          <option key={c} value={c}>{c} — {CURRENCY_NAMES[c]}</option>
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
          className={inputClassName}
        />
      )}
    </>
  );
}
