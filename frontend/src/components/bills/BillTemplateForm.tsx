"use client";

import { FormEvent, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import CategoryCombobox from "./CategoryCombobox";
import MonthDayCalendar from "./MonthDayCalendar";
import MonthYearPicker from "./MonthYearPicker";
import CurrencyPicker from "@/components/CurrencyPicker";
import { Checkbox } from "@/components/ui/Checkbox";
import Dropdown from "@/components/ui/Dropdown";
import { LOCALE_DEFAULT_CURRENCY } from "@/lib/currency";
import type { BillFrequency, BillTemplateCreate } from "@/lib/bills-api";

const FREQUENCY_VALUES: BillFrequency[] = ["monthly", "annual", "one_off"];

const RECURRING_FREQUENCIES: BillFrequency[] = ["monthly"];

interface Props {
  initial?: Partial<BillTemplateCreate>;
  startPeriod?: string | null; // saved start (YYYY-MM) when editing
  defaultCurrency?: string | null;
  onSave: (data: BillTemplateCreate) => Promise<void>;
  onCancel: () => void;
}

// Last scheduled payment on or before `end`, for a cycle of `step` months starting at `start`.
function lastPayment(start: string, end: string, step: number) {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const diff = (ey - sy) * 12 + (em - sm);
  if (diff < 0) return null;
  const total = sy * 12 + (sm - 1) + Math.floor(diff / step) * step;
  return { year: Math.floor(total / 12), month: (total % 12) + 1, aligned: diff % step === 0 };
}

interface Errors {
  name?: string;
  amount?: string;
  due_day?: string;
  category?: string;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5";

export default function BillTemplateForm({ initial, startPeriod, defaultCurrency, onSave, onCancel }: Props) {
  const t = useTranslations("BillTemplateForm");
  const tFreq = useTranslations("Frequencies");
  const locale = useLocale();
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(initial?.category_id ?? "");
  const [frequency, setFrequency] = useState<BillFrequency>(
    initial?.frequency ?? "monthly",
  );
  const [interval, setIntervalValue] = useState(initial?.interval ?? 1);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const initialCurrency =
    initial?.currency ?? defaultCurrency ?? LOCALE_DEFAULT_CURRENCY[locale] ?? "EUR";
  const [currency, setCurrency] = useState(initialCurrency);
  const [dueDay, setDueDay] = useState(
    initial?.due_day != null ? String(initial.due_day) : String(new Date().getDate()),
  );
  const [dueMonth, setDueMonth] = useState(
    initial?.due_month != null ? String(initial.due_month) : String(new Date().getMonth() + 1),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [endPeriod, setEndPeriod] = useState(initial?.end_period ?? "");
  const [isPaused, setIsPaused] = useState(initial?.is_paused ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const isRecurring = RECURRING_FREQUENCIES.includes(frequency);

  // Recurring bills anchor to the current year + chosen month on create (mirrors the backend).
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const effectiveStart =
    startPeriod ?? `${now.getFullYear()}-${String(parseInt(dueMonth, 10) || now.getMonth() + 1).padStart(2, "0")}`;
  const minEnd = effectiveStart > currentPeriod ? effectiveStart : currentPeriod;
  const maxInterval = frequency === "annual" ? 5 : 12;
  const effectiveInterval = frequency === "one_off" ? 1 : Math.min(interval, maxInterval);
  const step = effectiveInterval * (frequency === "annual" ? 12 : 1);
  const endHint = endPeriod ? lastPayment(effectiveStart, endPeriod, step) : null;

  function validate(fields: {
    name: string;
    amount: string;
    categoryId: number | "";
  }): Errors {
    const e: Errors = {};
    if (!fields.name.trim()) e.name = t("nameRequired");
    if (fields.amount.trim() && isNaN(Number(fields.amount.trim().replace(",", "."))))
      e.amount = t("amountInvalid");
    if (!fields.categoryId) e.category = t("categoryRequired");
    return e;
  }

  function revalidate(overrides: Partial<{ name: string; amount: string; categoryId: number | "" }>) {
    if (submitAttempted) {
      setErrors(validate({ name, amount, categoryId, ...overrides }));
    }
  }

  function handleNameChange(v: string) { setName(v); revalidate({ name: v }); }
  function handleAmountChange(v: string) { setAmount(v); revalidate({ amount: v }); }
  function handleCategoryChange(v: number | "") { setCategoryId(v); revalidate({ categoryId: v }); }
  function handleFrequencyChange(v: BillFrequency) { setFrequency(v); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    const errs = validate({ name, amount, categoryId });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setApiError(null);
    try {
      const payload: BillTemplateCreate = {
        name: name.trim(),
        category_id: categoryId as number,
        frequency,
        interval: effectiveInterval,
        amount: amount.trim().replace(",", ".") || "0",
        currency: currency || "EUR",
        due_day: dueDay ? parseInt(dueDay, 10) : null,
        due_month: dueMonth ? parseInt(dueMonth, 10) : null,
        end_period: isRecurring ? endPeriod || null : null,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {apiError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {apiError}
        </div>
      )}

      {/* Row 1: Name + Amount */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bill-name" className={labelClass}>
            {t("nameLabel")} <span className="text-red-400">*</span>
          </label>
          <input
            id="bill-name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t("namePlaceholder")}
            className={inputClass}
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="bill-amount" className={labelClass}>{t("amountLabel")}</label>
          <input
            id="bill-amount"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className={inputClass}
          />
          {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
          <div className="mt-2">
            <CurrencyPicker
              value={currency}
              onChange={setCurrency}
              ariaLabel={t("currencyAriaLabel")}
              customOption={t("customOption")}
              customCurrencyAriaLabel={t("customCurrencyAriaLabel")}
              customCurrencyPlaceholder={t("customCurrencyPlaceholder")}
              inputClassName={inputClass + " mt-2"}
            />
          </div>
        </div>
      </div>

      {/* Row 2: Frequency pills */}
      <div>
        <label className={labelClass}>
          {t("frequencyLabel")} <span className="text-red-400">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {FREQUENCY_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleFrequencyChange(v)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                frequency === v
                  ? "border-green-600 bg-green-50 text-green-700 shadow-sm dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
              }`}
            >
              {tFreq(v)}
            </button>
          ))}
        </div>
        {frequency !== "one_off" && (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="bill-interval" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("intervalLabel")}
            </label>
            <Dropdown
              id="bill-interval"
              variant="pill"
              scrollable
              value={String(effectiveInterval)}
              onChange={(v) => setIntervalValue(Number(v))}
              options={Array.from({ length: maxInterval }, (_, i) => ({
                value: String(i + 1),
                label: tFreq(frequency === "annual" ? "years" : "months", { count: i + 1 }),
              }))}
            />
          </div>
        )}
      </div>

      {/* Row 3: Start date + optional end month (fixed-term bills) */}
      <div className={isRecurring ? "grid gap-4 sm:grid-cols-2" : ""}>
        <div>
          <label className={labelClass}>
            {isRecurring ? t("startDateLabel") : t("dueDateLabel")}
          </label>
          <MonthDayCalendar
            month={parseInt(dueMonth, 10) || new Date().getMonth() + 1}
            day={parseInt(dueDay, 10) || new Date().getDate()}
            onChange={(m, d) => { setDueMonth(String(m)); setDueDay(String(d)); }}
          />
        </div>
        {isRecurring && (
          <div>
            <label htmlFor="bill-end-period" className={labelClass}>{t("endPeriodLabel")}</label>
            <MonthYearPicker id="bill-end-period" value={endPeriod} min={minEnd} onChange={setEndPeriod} />
            {endHint && (
              <p
                className={`mt-1.5 text-xs ${
                  endHint.aligned
                    ? "text-slate-500 dark:text-slate-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {t(endHint.aligned ? "endPeriodLast" : "endPeriodAdjusted", {
                  month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
                    new Date(endHint.year, endHint.month - 1, 1),
                  ),
                })}
              </p>
            )}
            {endPeriod && isPaused && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">{t("endPeriodPaused")}</p>
            )}
          </div>
        )}
      </div>

      {/* Row 4: Category + Notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bill-category" className={labelClass}>{t("categoryLabel")}</label>
          <CategoryCombobox
            id="bill-category"
            value={categoryId}
            onChange={handleCategoryChange}
          />
          {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
        </div>
        <div>
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

      {/* Paused toggle */}
      <Checkbox checked={isPaused} onChange={setIsPaused} label={t("pauseRecurrence")} />

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-emerald-200 bg-white px-4 py-1.5 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
