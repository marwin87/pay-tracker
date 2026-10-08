"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import HelpContent from "@/components/help/HelpContent";

/** Desktop FAQ: centered dialog. (On a phone the help button opens the /dashboard/help page instead.) */
export default function HelpSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Help");
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h2 id="help-dialog-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {t("title")}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t("intro")}</p>
          </div>
          <button
            autoFocus
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        <HelpContent scroll onDone={onClose} />
      </div>
    </div>,
    document.body,
  );
}
