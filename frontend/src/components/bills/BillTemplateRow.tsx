"use client";

import { Pencil, Archive as ArchiveIcon, ChevronUp, PauseCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import BillTemplateForm from "./BillTemplateForm";
import type { BillTemplateOut, BillTemplateUpdate } from "@/lib/bills-api";

interface Props {
  template: BillTemplateOut;
  isExpanded: boolean;
  categorySuggestions: string[];
  onEditToggle: () => void;
  onSave: (data: BillTemplateUpdate) => Promise<void>;
  onArchive: () => void;
}

export default function BillTemplateRow({
  template,
  isExpanded,
  categorySuggestions,
  onEditToggle,
  onSave,
  onArchive,
}: Props) {
  const t = useTranslations("BillTemplateRow");
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:bg-slate-800 dark:border-slate-700">
      {/* Collapsed row */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${template.is_paused ? "opacity-60" : ""}`}
      >
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <span className="font-semibold text-base text-slate-800 dark:text-slate-100 truncate">
            {template.name}
          </span>
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {template.amount} {template.currency}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {t(`frequency.${template.frequency}` as never) ?? template.frequency}
          </span>
          {template.due_day != null && (
            <span className="text-sm text-slate-400 dark:text-slate-500">
              {t("day")}&nbsp;{template.due_day}
            </span>
          )}
          {template.category && (
            <span className="text-sm text-slate-400 dark:text-slate-500">
              {template.category}
            </span>
          )}
          {template.is_paused && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <PauseCircle size={11} />
              {t("paused")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEditToggle}
            aria-label={isExpanded ? t("close") : t("edit")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-green-50 hover:text-green-800 dark:hover:bg-green-900/30 dark:hover:text-green-300 transition-colors"
          >
            {isExpanded ? <ChevronUp size={15} /> : <Pencil size={15} />}
            <span className="hidden sm:inline">{isExpanded ? t("close") : t("edit")}</span>
          </button>
          <button
            onClick={onArchive}
            aria-label={t("archive")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
          >
            <ArchiveIcon size={15} />
            <span className="hidden sm:inline">{t("archive")}</span>
          </button>
        </div>
      </div>

      {/* Expanded edit form */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
          <BillTemplateForm
            initial={{
              name: template.name,
              category: template.category,
              frequency: template.frequency,
              amount: template.amount,
              currency: template.currency,
              due_day: template.due_day,
              notes: template.notes,
              is_paused: template.is_paused,
            }}
            categorySuggestions={categorySuggestions}
            onSave={onSave}
            onCancel={onEditToggle}
          />
        </div>
      )}
    </div>
  );
}
