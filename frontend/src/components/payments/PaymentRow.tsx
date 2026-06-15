"use client";

import { useState, useRef, useEffect } from "react";
import { CheckCircle, Loader2, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PaymentInstanceOut } from "@/lib/payments-api";
import { revertPay } from "@/lib/payments-api";

const STATUS_STYLES: Record<string, string> = {
  upcoming:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  overdue:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

interface Props {
  instance: PaymentInstanceOut;
  onMarkPaid: (instance: PaymentInstanceOut) => void;
  onDelete: (instance: PaymentInstanceOut) => void;
  onReverted: (updated: PaymentInstanceOut) => void;
  /** True for past months — hides the Mark as Paid button. */
  readOnly?: boolean;
}

export default function PaymentRow({ instance, onMarkPaid, onDelete, onReverted, readOnly = false }: Props) {
  const t = useTranslations("PaymentRow");
  const [reverting, setReverting] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!noteOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (noteRef.current && !noteRef.current.contains(e.target as Node)) {
        setNoteOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [noteOpen]);

  async function handleRevert() {
    setReverting(true);
    try {
      const updated = await revertPay(instance.id);
      onReverted(updated);
    } finally {
      setReverting(false);
    }
  }

  // Append T00:00:00 so JS treats due_date as local time, not UTC midnight
  const dueDate = new Date(instance.due_date + "T00:00:00");
  const dueDateFormatted = dueDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

  const paidAt = instance.paid_at ? new Date(instance.paid_at) : null;
  const paidAtFormatted = paidAt
    ? paidAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center gap-3">
        {/* Main info */}
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <span className="font-semibold text-base text-slate-800 dark:text-slate-100 truncate">
            {instance.bill_name}
          </span>
          {parseFloat(instance.amount) > 0 && (
            <span className="font-medium text-indigo-600 dark:text-indigo-400">
              {instance.amount} {instance.currency}
            </span>
          )}
          <span className="text-sm text-slate-400 dark:text-slate-500">
            {dueDateFormatted}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[instance.status] ?? ""}`}
          >
            {t(`status.${instance.status}` as Parameters<typeof t>[0])}
          </span>
          {instance.status === "paid" && paidAtFormatted && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {t("paidOn")} {paidAtFormatted}
              {instance.paid_amount != null && parseFloat(instance.paid_amount) > 0 && (
                <> · {instance.paid_amount} {instance.currency}</>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Mark as Paid — hidden for past months and already-paid instances */}
          {!readOnly && instance.status !== "paid" && (
            <button
              onClick={() => onMarkPaid(instance)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300 transition-colors"
            >
              <CheckCircle size={15} />
              <span className="hidden sm:inline">{t("markAsPaid")}</span>
            </button>
          )}
          {/* Note — visible for paid instances with a note */}
          {instance.status === "paid" && instance.notes && (
            <>
              <div className="relative" ref={noteRef}>
                <button
                  aria-label={t("paymentNote")}
                  aria-expanded={noteOpen}
                  onClick={() => setNoteOpen((o) => !o)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  <MessageSquare size={15} />
                </button>
                {noteOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-56 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg dark:bg-slate-700 z-10">
                    {instance.notes}
                    <div className="absolute top-full right-3 -mt-px border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
                  </div>
                )}
              </div>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />
            </>
          )}
          {/* Revert — visible for paid instances */}
          {instance.status === "paid" && (
            <button
              onClick={handleRevert}
              disabled={reverting}
              title={t("revert")}
              aria-label={t("revert")}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              {reverting ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            </button>
          )}
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />
          <button
            onClick={() => onDelete(instance)}
            aria-label={t("delete")}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
