"use client";

import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  billName: string;
  onConfirm: () => void;
  onCancel: () => void;
  archiving?: boolean;
}

export default function ArchiveConfirmDialog({ billName, onConfirm, onCancel, archiving = false }: Props) {
  const t = useTranslations("ArchiveConfirmDialog");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-dialog-title"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <Archive size={22} />
        </div>
        <h2
          id="archive-dialog-title"
          className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100"
        >
          {t("title", { billName })}
        </h2>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          {t("description")}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            autoFocus
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={archiving}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {archiving ? t("archiving") : t("archive")}
          </button>
        </div>
      </div>
    </div>
  );
}
