"use client";

import { Pause } from "lucide-react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";

interface Props {
  billName: string;
  onConfirm: () => void;
  onCancel: () => void;
  pausing?: boolean;
}

export default function PauseConfirmDialog({ billName, onConfirm, onCancel, pausing = false }: Props) {
  const t = useTranslations("PauseConfirmDialog");
  return createPortal(
    <div className="fixed inset-0 z-50 flex [align-items:safe_center] justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-dialog-title"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <Pause size={22} />
        </div>
        <h2
          id="pause-dialog-title"
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
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={pausing}
            className="flex-1 rounded-lg border border-transparent bg-amber-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-amber-700 disabled:opacity-50"
          >
            {pausing ? t("pausing") : t("pause")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
