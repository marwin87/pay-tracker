"use client";

import { useState, useRef, useEffect } from "react";
import { AlertCircle, AtSign, CheckCircle, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { PaymentInstanceOut } from "@/lib/payments-api";

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
  onRevert: (instance: PaymentInstanceOut) => void;
  /** True for past months — hides the Mark as Paid button. */
  readOnly?: boolean;
}

export default function PaymentRow({ instance, onMarkPaid, onDelete, onRevert, readOnly = false }: Props) {
  const t = useTranslations("PaymentRow");
  const locale = useLocale();
  const [emailOpen, setEmailOpen] = useState(false);
  const emailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!emailOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (emailRef.current && !emailRef.current.contains(e.target as Node)) {
        setEmailOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emailOpen]);

  // Append T00:00:00 so JS treats due_date as local time, not UTC midnight
  const dueDate = new Date(instance.due_date + "T00:00:00");
  function formatDate(date: Date): string {
    const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    return fmt.formatToParts(date).map(({ type, value }) =>
      type === "month" ? value.charAt(0).toUpperCase() + value.slice(1) : value
    ).join("");
  }

  const dueDateFormatted = formatDate(dueDate);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isDueToday = dueDate.getTime() === today.getTime();

  function tileGradientClass(): string {
    const base = "bg-gradient-to-r from-0% to-70%";
    if (instance.status === "overdue") return `${base} from-red-100 to-white dark:from-red-500/10 dark:to-slate-800`;
    if (instance.status === "paid") return `${base} from-green-100 to-white dark:from-green-500/10 dark:to-slate-800`;
    if (isDueToday) return `${base} from-orange-100 to-white dark:from-orange-400/10 dark:to-slate-800`;
    return `${base} from-blue-100 to-white dark:from-blue-400/10 dark:to-slate-800`;
  }

  const paidAt = instance.paid_at ? new Date(instance.paid_at) : null;
  const paidAtFormatted = paidAt ? formatDate(paidAt) : null;

  const amountMismatch =
    instance.status === "paid" &&
    instance.paid_amount != null &&
    parseFloat(instance.amount) > 0 &&
    parseFloat(instance.paid_amount) !== parseFloat(instance.amount);

  const emailSentAt = instance.email_sent_at ? new Date(instance.email_sent_at) : null;
  const emailSentAtFormatted = emailSentAt
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(emailSentAt)
    : null;

  return (
    <div className={`rounded-xl border border-slate-200 px-4 py-3 shadow-sm dark:border-slate-700 transition-colors ${tileGradientClass()}`}>
      <div className="flex flex-col gap-0.5">
        {/* Name */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
            {instance.bill_name}
          </span>
          {instance.is_last && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">
              {t("lastPayment")}
            </span>
          )}
        </div>
        {/* Amount */}
        {parseFloat(instance.amount) > 0 && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {instance.amount} {instance.currency}
          </span>
        )}
        {/* Due date + status (left) — actions (right) */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="text-slate-400 dark:text-slate-500 shrink-0">
              {t("due")} {dueDateFormatted}
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            {instance.status === "paid" && paidAtFormatted ? (
              <span className="text-emerald-600 dark:text-emerald-400 truncate">
                {t("paidOn")} {paidAtFormatted}
                {instance.paid_amount != null && parseFloat(instance.paid_amount) > 0 && (
                  <> · {instance.paid_amount} {instance.currency}</>
                )}
              </span>
            ) : isDueToday && instance.status === "upcoming" ? (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium shrink-0 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                {t("dueToday")}
              </span>
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${STATUS_STYLES[instance.status] ?? ""}`}>
                {t(`status.${instance.status}` as Parameters<typeof t>[0])}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Primary action */}
            {!readOnly && instance.status !== "paid" && (
              <button
                onClick={() => onMarkPaid(instance)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
              >
                <CheckCircle size={14} />
                <span className="hidden sm:inline">{t("markAsPaid")}</span>
              </button>
            )}
            {/* Revert — visible for paid instances */}
            {instance.status === "paid" && (
              <button
                onClick={() => onRevert(instance)}
                title={t("revert")}
                aria-label={t("revert")}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                <RotateCcw size={14} />
              </button>
            )}
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />
            {/* Email notification indicator */}
            <div className="relative" ref={emailRef}>
              <button
                aria-label={t("emailNotification")}
                aria-expanded={emailOpen}
                onClick={() => setEmailOpen((o) => !o)}
                className={`rounded-lg p-1.5 transition-colors ${
                  emailSentAt
                    ? "text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    : "text-slate-300 hover:bg-slate-100 hover:text-slate-400 dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-500"
                }`}
              >
                <AtSign size={14} />
              </button>
              {emailOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-48 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg dark:bg-slate-700 z-10 whitespace-normal">
                  {emailSentAtFormatted
                    ? `${t("emailSentOn")} ${emailSentAtFormatted}`
                    : t("emailNotSent")}
                  <div className="absolute top-full right-3 -mt-px border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
                </div>
              )}
            </div>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5" />
            <button
              onClick={() => onDelete(instance)}
              aria-label={t("delete")}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {/* Note — shown below when present */}
        {instance.status === "paid" && instance.notes && (
          <>
            <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1" />
            <div className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <MessageSquare size={12} className="shrink-0 mt-0.5" />
              <span>{instance.notes}</span>
            </div>
          </>
        )}
        {/* Amount mismatch warning */}
        {amountMismatch && (
          <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 mt-0.5">
            <AlertCircle size={12} className="shrink-0 text-amber-500 dark:text-amber-400" />
            <span>
              {t.rich("amountMismatch", {
                expected: `${instance.amount} ${instance.currency}`,
                paid: `${instance.paid_amount} ${instance.currency}`,
                expTag: (chunks) => <strong className="font-semibold text-slate-800 dark:text-slate-100">{chunks}</strong>,
                paidTag: (chunks) => <strong className="font-semibold text-amber-600 dark:text-amber-400">{chunks}</strong>,
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
