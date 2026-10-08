"use client";

import {
  Pencil,
  Archive as ArchiveIcon,
  ChevronUp,
  NotebookPen,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import BillTemplateForm from "./BillTemplateForm";
import type { BillTemplateOut, BillTemplateUpdate } from "@/lib/bills-api";
import { categoryBorderClass } from "@/lib/categories";
import { useFrequencyLabel } from "@/lib/frequency";
import { formatAmount } from "@/lib/summary";

interface Props {
  template: BillTemplateOut;
  isExpanded: boolean;
  highlighted?: boolean;
  onEditToggle: () => void;
  onSave: (data: BillTemplateUpdate) => Promise<void>;
  onArchive: () => void;
}

export function formatDueLabel(template: BillTemplateOut, locale: string): string | null {
  const { frequency, due_day, due_month, start_period } = template;

  if (frequency === "one_off") {
    if (!start_period) return null;
    const [year, month] = start_period.split("-").map(Number);
    const monthName = new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(year, month - 1)
    );
    if (due_day != null) return `${monthName} ${due_day}`;
    return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(
      new Date(year, month - 1)
    );
  }

  if (frequency === "annual" && due_day != null && due_month != null) {
    const monthName = new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(2000, due_month - 1)
    );
    return `${monthName} ${due_day}`;
  }

  if (due_day != null) return String(due_day);
  return null;
}

export function formatLastPaymentLabel(endPeriod: string | null, locale: string): string | null {
  if (!endPeriod) return null;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(Number(endPeriod.slice(0, 4)), Number(endPeriod.slice(5, 7)) - 1, 1),
  );
}

export default function BillTemplateRow({
  template,
  isExpanded,
  highlighted = false,
  onEditToggle,
  onSave,
  onArchive,
}: Props) {
  const t = useTranslations("BillTemplateRow");
  const frequencyLabel = useFrequencyLabel();
  const locale = useLocale();
  const { decimalSeparator } = useAppLocale();

  const dueLabel = formatDueLabel(template, locale);

  const leftBorder = categoryBorderClass(template.category.color);
  const lastPaymentLabel = formatLastPaymentLabel(template.end_period, locale);

  return (
    <div
      id={`bill-${template.id}`}
      className={`bill-row group rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow duration-500 dark:bg-slate-800 dark:border-slate-700 border-l-4 ${leftBorder} ${
        highlighted ? "bill-row-highlight ring-2 ring-green-200 dark:ring-green-800" : ""
      }`}
    >
      {/* Collapsed row */}
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        {/* Two-line content */}
        <div className="flex flex-1 flex-col min-w-0 gap-0.5">
          {/* Line 1: name */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
              {template.name}
            </span>
          </div>

          {/* Line 2: amount · frequency · due */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {formatAmount(template.amount, decimalSeparator)} {template.currency}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {frequencyLabel(template.frequency, template.interval)}
            </span>
            {dueLabel && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {t("dueOn")}&nbsp;{dueLabel}
              </span>
            )}
            {lastPaymentLabel && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {t("lastPayment", { month: lastPaymentLabel })}
              </span>
            )}
          </div>

          {/* Notes */}
          {template.notes && (
            <div className="flex items-start gap-1 mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              <NotebookPen size={10} className="mt-0.5 shrink-0" />
              <span className="line-clamp-1">{template.notes}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0">
          <div className="flex items-center justify-end gap-3 sm:gap-1">
            <button
              onClick={onEditToggle}
              aria-label={isExpanded ? t("close") : t("edit")}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            >
              {isExpanded ? <ChevronUp className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /> : <Pencil className="h-5 w-5 sm:h-[15px] sm:w-[15px]" />}
              <span>{isExpanded ? t("close") : t("edit")}</span>
            </button>
            <button
              onClick={onArchive}
              aria-label={t("archive")}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 text-sm font-medium text-slate-400 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <ArchiveIcon className="h-5 w-5 sm:h-[15px] sm:w-[15px]" />
              <span>{t("archive")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expanded edit form */}
      {isExpanded && (
        <div className="rounded-b-xl border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-5">
          <BillTemplateForm
            startPeriod={template.start_period}
            initial={{
              name: template.name,
              category_id: template.category.id,
              frequency: template.frequency,
              interval: template.interval,
              amount: template.amount,
              currency: template.currency,
              due_day: template.due_day,
              due_month: template.due_month,
              end_period: template.end_period,
              notes: template.notes,
            }}
            onSave={onSave}
            onCancel={onEditToggle}
          />
        </div>
      )}
    </div>
  );
}
