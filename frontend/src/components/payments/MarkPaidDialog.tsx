"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { markPaid, updatePayment, type PaymentInstanceOut } from "@/lib/payments-api";
import PaymentDateCalendar, { toISODate } from "./PaymentDateCalendar";

interface Props {
  instance: PaymentInstanceOut;
  isOpen: boolean;
  /** "pay" marks it paid; "edit" changes a payment (paid or not) in place. */
  mode?: "pay" | "edit";
  onClose: () => void;
  onConfirm: (updated: PaymentInstanceOut) => void;
}

export default function MarkPaidDialog({
  instance,
  isOpen,
  mode = "pay",
  onClose,
  onConfirm,
}: Props) {
  const t = useTranslations("MarkPaidDialog");

  const isEdit = mode === "edit";
  const isPaid = instance.status === "paid";
  // Editing an unpaid payment: no date, and an empty amount means "use the
  // bill's amount" (the placeholder shows it).
  const editingUnpaid = isEdit && !isPaid;

  const [paidAmount, setPaidAmount] = useState(
    (isEdit
      ? isPaid
        ? instance.paid_amount
        : instance.amount_overridden
          ? instance.amount
          : ""
      : instance.amount) ?? "",
  );
  const [paidDate, setPaidDate] = useState(
    toISODate(isEdit && instance.paid_at ? new Date(instance.paid_at) : new Date()),
  );
  const [notes, setNotes] = useState(instance.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  if (!isOpen) return null;

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      const amount = paidAmount === "" ? null : parseFloat(paidAmount);
      const updated = !isEdit
        ? await markPaid(instance.id, paidAmount || null, notes, paidDate)
        : editingUnpaid
          ? await updatePayment(instance.id, { amount, notes })
          : await updatePayment(instance.id, {
              paid_amount: amount,
              notes,
              paid_at: paidDate,
            });
      onConfirm(updated);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : t("saveFailed"));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-paid-dialog-title"
        onKeyDown={(e) => e.key === "Escape" && !isSubmitting && onClose()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <CheckCircle size={22} />
        </div>

        <h2
          id="mark-paid-dialog-title"
          className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100"
        >
          {t(isEdit ? "editTitle" : "title", { billName: instance.bill_name })}
        </h2>

        {!editingUnpaid && (
          <div className="mb-3">
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("dateLabel")}
            </label>
            <PaymentDateCalendar value={paidDate} onChange={setPaidDate} />
          </div>
        )}

        <div className="mb-3">
          <label
            htmlFor="paid-amount"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {t(editingUnpaid ? "dueAmountLabel" : "amountLabel")}
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-100 dark:border-slate-600 dark:bg-slate-900/40 dark:focus-within:border-green-600">
            <input
              id="paid-amount"
              type="number"
              step="0.01"
              min="0"
              value={paidAmount}
              placeholder={editingUnpaid ? instance.amount : undefined}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-800 outline-none dark:text-slate-100"
            />
            <span className="text-sm text-slate-400 dark:text-slate-500">
              {instance.currency}
            </span>
          </div>
          {editingUnpaid && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {t("amountHint")}
            </p>
          )}
        </div>

        <div className="mb-5">
          <label
            htmlFor="paid-notes"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {t("notesLabel")}
          </label>
          <textarea
            id="paid-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:focus:border-green-600"
          />
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-emerald-200 bg-white py-2.5 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
          >
            {isSubmitting ? t("confirming") : t(isEdit ? "save" : "confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
