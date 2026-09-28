"use client";

import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

export function UnsavedChangesDialog({
  onLeave,
  onStay,
  t,
}: {
  onLeave: () => void;
  onStay: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onStay}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl bg-white dark:bg-slate-800 shadow-xl p-6">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">
          {t("unsavedTitle")}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          {t("unsavedDescription")}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onStay}
            className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("unsavedStay")}
          </button>
          <button
            onClick={onLeave}
            className="rounded-lg border border-red-200 bg-white px-4 py-1.5 text-sm font-medium text-red-600 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-red-800 dark:bg-slate-800 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-300"
          >
            {t("unsavedLeave")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
