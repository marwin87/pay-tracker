"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import CategoryCombobox from "./CategoryCombobox";
import type { BillFrequency, BillTemplateCreate } from "@/lib/bills-api";

const PRESET_CURRENCIES = ["EUR", "PLN", "USD"] as const;

const FREQUENCY_VALUES: BillFrequency[] = ["monthly", "quarterly", "annual", "one_off"];

const DUE_DAY_FREQUENCIES: BillFrequency[] = ["monthly", "quarterly"];

type CurrencyOption = (typeof PRESET_CURRENCIES)[number] | "custom";

interface Props {
  initial?: Partial<BillTemplateCreate>;
  categorySuggestions: string[];
  onSave: (data: BillTemplateCreate) => Promise<void>;
  onCancel: () => void;
}

interface Errors {
  name?: string;
  amount?: string;
  due_day?: string;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40";

const labelClass = "block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1";

export default function BillTemplateForm({
  initial,
  categorySuggestions,
  onSave,
  onCancel,
}: Props) {
  const t = useTranslations("BillTemplateForm");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [frequency, setFrequency] = useState<BillFrequency>(
    initial?.frequency ?? "monthly",
  );
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const initialCurrency = initial?.currency ?? "EUR";
  const isPreset = (PRESET_CURRENCIES as readonly string[]).includes(initialCurrency);
  const [currencyOption, setCurrencyOption] = useState<CurrencyOption>(
    isPreset ? (initialCurrency as CurrencyOption) : "custom",
  );
  const [customCurrency, setCustomCurrency] = useState(isPreset ? "" : initialCurrency);
  const [dueDay, setDueDay] = useState(
    initial?.due_day != null ? String(initial.due_day) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isPaused, setIsPaused] = useState(initial?.is_paused ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const showDueDay = DUE_DAY_FREQUENCIES.includes(frequency);

  function validate(fields: {
    name: string;
    amount: string;
    dueDay: string;
    showDueDay: boolean;
  }): Errors {
    const e: Errors = {};
    if (!fields.name.trim()) e.name = t("nameRequired");
    const trimmed = fields.amount.trim();
    const amt = Number(trimmed);
    if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed) || amt <= 0)
      e.amount = t("amountPositive");
    if (fields.showDueDay && fields.dueDay) {
      const day = parseInt(fields.dueDay, 10);
      if (isNaN(day) || day < 1 || day > 31)
        e.due_day = t("dueDayRange");
    }
    return e;
  }

  // React guarantees setter refs are stable — safe for identity comparison here.
  function handleChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      if (submitAttempted) {
        const next = {
          name: setter === setName ? (v as unknown as string) : name,
          amount: setter === setAmount ? (v as unknown as string) : amount,
          dueDay: setter === setDueDay ? (v as unknown as string) : dueDay,
          showDueDay,
        };
        setErrors(validate(next));
      }
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    const errs = validate({ name, amount, dueDay, showDueDay });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setApiError(null);
    try {
      const resolvedCurrency =
        currencyOption === "custom" ? customCurrency.trim().toUpperCase() : currencyOption;
      const payload: BillTemplateCreate = {
        name: name.trim(),
        category: category.trim() || null,
        frequency,
        amount,
        currency: resolvedCurrency || "EUR",
        due_day: showDueDay && dueDay ? parseInt(dueDay, 10) : null,
        notes: notes.trim() || null,
        is_paused: isPaused,
      };
      await onSave(payload);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {apiError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {apiError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Name */}
        <div>
          <label htmlFor="bill-name" className={labelClass}>
            {t("nameLabel")} <span className="text-red-500">*</span>
          </label>
          <input
            id="bill-name"
            value={name}
            onChange={(e) => handleChange(setName)(e.target.value)}
            placeholder={t("namePlaceholder")}
            className={inputClass}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name}</p>
          )}
        </div>

        {/* Amount + Currency */}
        <div>
          <label htmlFor="bill-amount" className={labelClass}>
            {t("amountLabel")} <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              id="bill-amount"
              value={amount}
              onChange={(e) => handleChange(setAmount)(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className={inputClass}
            />
            <select
              aria-label={t("currencyAriaLabel")}
              value={currencyOption}
              onChange={(e) => setCurrencyOption(e.target.value as CurrencyOption)}
              className="w-28 shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
            >
              {PRESET_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="custom">{t("customOption")}</option>
            </select>
          </div>
          {currencyOption === "custom" && (
            <input
              aria-label={t("customCurrencyAriaLabel")}
              value={customCurrency}
              onChange={(e) => setCustomCurrency(e.target.value)}
              placeholder={t("customCurrencyPlaceholder")}
              maxLength={10}
              className={inputClass + " mt-2"}
            />
          )}
          {errors.amount && (
            <p className="mt-1 text-xs text-red-500">{errors.amount}</p>
          )}
        </div>

        {/* Frequency */}
        <div>
          <label htmlFor="bill-frequency" className={labelClass}>
            {t("frequencyLabel")} <span className="text-red-500">*</span>
          </label>
          <select
            id="bill-frequency"
            value={frequency}
            onChange={(e) =>
              handleChange(setFrequency)(e.target.value as BillFrequency)
            }
            className={inputClass}
          >
            {FREQUENCY_VALUES.map((v) => (
              <option key={v} value={v}>
                {t(`frequency.${v}` as never)}
              </option>
            ))}
          </select>
        </div>

        {/* Due day (conditional) */}
        {showDueDay && (
          <div>
            <label htmlFor="bill-due-day" className={labelClass}>{t("dueDayLabel")}</label>
            <input
              id="bill-due-day"
              value={dueDay}
              onChange={(e) => handleChange(setDueDay)(e.target.value)}
              placeholder="e.g. 15"
              inputMode="numeric"
              className={inputClass}
            />
            {errors.due_day && (
              <p className="mt-1 text-xs text-red-500">{errors.due_day}</p>
            )}
          </div>
        )}

        {/* Category */}
        <div>
          <label htmlFor="bill-category" className={labelClass}>{t("categoryLabel")}</label>
          <CategoryCombobox
            id="bill-category"
            value={category as string}
            onChange={setCategory}
            suggestions={categorySuggestions}
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label htmlFor="bill-notes" className={labelClass}>{t("notesLabel")}</label>
          <textarea
            id="bill-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t("notesPlaceholder")}
            className={inputClass + " resize-none"}
          />
        </div>
      </div>

      {/* Paused */}
      <label className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
        <input
          type="checkbox"
          checked={isPaused}
          onChange={(e) => setIsPaused(e.target.checked)}
          className="h-4 w-4 rounded accent-indigo-600"
        />
        {t("pauseRecurrence")}
      </label>

      <div className="flex justify-end gap-3 pt-1 border-t border-slate-100 dark:border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
