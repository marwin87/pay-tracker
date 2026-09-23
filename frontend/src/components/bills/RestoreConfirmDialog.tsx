"use client";

import { ArchiveRestore } from "lucide-react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";

interface Props {
  billName: string;
  onConfirm: () => void;
  onCancel: () => void;
  restoring?: boolean;
}

export default function RestoreConfirmDialog({ billName, onConfirm, onCancel, restoring = false }: Props) {
  const t = useTranslations("RestoreConfirmDialog");
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-dialog-title"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <ArchiveRestore size={22} />
        </div>
        <h2
          id="restore-dialog-title"
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
            disabled={restoring}
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={restoring}
            className="flex-1 rounded-lg border border-emerald-200 bg-white py-2.5 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
          >
            {restoring ? t("restoring") : t("restore")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
