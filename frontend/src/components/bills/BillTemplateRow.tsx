"use client";

import { Pencil, Archive as ArchiveIcon, ChevronUp, PauseCircle, NotebookPen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import BillTemplateForm from "./BillTemplateForm";
import type { BillTemplateOut, BillTemplateUpdate } from "@/lib/bills-api";

interface Props {
  template: BillTemplateOut;
  isExpanded: boolean;
  onEditToggle: () => void;
  onSave: (data: BillTemplateUpdate) => Promise<void>;
  onArchive: () => void;
}

function formatDueLabel(template: BillTemplateOut, locale: string): string | null {
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

export default function BillTemplateRow({
  template,
  isExpanded,
  onEditToggle,
  onSave,
  onArchive,
}: Props) {
  const t = useTranslations("BillTemplateRow");
  const locale = useLocale();
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:bg-slate-800 dark:border-slate-700">
      {/* Collapsed row */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${template.is_paused ? "opacity-60" : ""}`}
      >
        <div className="flex flex-1 flex-col min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <span className="font-semibold text-base text-slate-800 dark:text-slate-100 truncate">
            {template.name}
          </span>
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {template.amount} {template.currency}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {t(`frequency.${template.frequency}` as never) ?? template.frequency}
          </span>
          {formatDueLabel(template, locale) && (
            <span className="text-sm text-slate-400 dark:text-slate-500">
              {t("dueOn")}&nbsp;{formatDueLabel(template, locale)}
            </span>
          )}
          {template.is_paused && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <PauseCircle size={11} />
              {t("paused")}
            </span>
          )}
        </div>
        {template.notes && (
          <div className="flex items-start gap-1.5 mt-1 text-xs text-slate-400 dark:text-slate-500">
            <NotebookPen size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-1">{template.notes}</span>
          </div>
        )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEditToggle}
            aria-label={isExpanded ? t("close") : t("edit")}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
          >
            {isExpanded ? <ChevronUp size={15} /> : <Pencil size={15} />}
            <span className="hidden sm:inline">{isExpanded ? t("close") : t("edit")}</span>
          </button>
          <button
            onClick={onArchive}
            aria-label={t("archive")}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-400 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <ArchiveIcon size={15} />
            <span className="hidden sm:inline">{t("archive")}</span>
          </button>
        </div>
      </div>

      {/* Expanded edit form */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-5">
          <BillTemplateForm
            initial={{
              name: template.name,
              category: template.category,
              frequency: template.frequency,
              amount: template.amount,
              currency: template.currency,
              due_day: template.due_day,
              due_month: template.due_month,
              notes: template.notes,
              is_paused: template.is_paused,
            }}
            onSave={onSave}
            onCancel={onEditToggle}
          />
        </div>
      )}
    </div>
  );
}
