"use client";

import { FormEvent, useState } from "react";
import CategoryCombobox from "./CategoryCombobox";
import type { BillFrequency, BillTemplateCreate } from "@/lib/bills-api";

const FREQUENCIES: { value: BillFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "one_off", label: "One-off" },
];

const DUE_DAY_FREQUENCIES: BillFrequency[] = ["monthly", "quarterly"];

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
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [frequency, setFrequency] = useState<BillFrequency>(
    initial?.frequency ?? "monthly",
  );
  const [amount, setAmount] = useState(initial?.amount ?? "");
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
    if (!fields.name.trim()) e.name = "Name is required.";
    const amt = parseFloat(fields.amount);
    if (!fields.amount.trim() || isNaN(amt) || amt <= 0)
      e.amount = "Enter a positive amount.";
    if (fields.showDueDay && fields.dueDay) {
      const day = parseInt(fields.dueDay, 10);
      if (isNaN(day) || day < 1 || day > 31)
        e.due_day = "Must be between 1 and 31.";
    }
    return e;
  }

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
      const payload: BillTemplateCreate = {
        name: name.trim(),
        category: category.trim() || null,
        frequency,
        amount,
        due_day: showDueDay && dueDay ? parseInt(dueDay, 10) : null,
        notes: notes.trim() || null,
        is_paused: isPaused,
      };
      await onSave(payload);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Save failed.");
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
          <label className={labelClass}>
            Name <span className="text-red-500">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => handleChange(setName)(e.target.value)}
            placeholder="e.g. Electricity"
            className={inputClass}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name}</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className={labelClass}>
            Amount (€) <span className="text-red-500">*</span>
          </label>
          <input
            value={amount}
            onChange={(e) => handleChange(setAmount)(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className={inputClass}
          />
          {errors.amount && (
            <p className="mt-1 text-xs text-red-500">{errors.amount}</p>
          )}
        </div>

        {/* Frequency */}
        <div>
          <label className={labelClass}>
            Frequency <span className="text-red-500">*</span>
          </label>
          <select
            value={frequency}
            onChange={(e) =>
              handleChange(setFrequency)(e.target.value as BillFrequency)
            }
            className={inputClass}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Due day (conditional) */}
        {showDueDay && (
          <div>
            <label className={labelClass}>Due day of month</label>
            <input
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
          <label className={labelClass}>Category</label>
          <CategoryCombobox
            value={category as string}
            onChange={setCategory}
            suggestions={categorySuggestions}
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className={labelClass}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional notes"
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
        Pause recurrence (no new instances created)
      </label>

      <div className="flex justify-end gap-3 pt-1 border-t border-slate-100 dark:border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
