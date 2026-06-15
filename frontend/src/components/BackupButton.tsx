"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { HardDriveDownload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { downloadBackup } from "@/lib/export-api";

type State = "idle" | "confirming" | "downloading" | "error";

export default function BackupButton() {
  const t = useTranslations("BackupButton");
  const [state, setState] = useState<State>("idle");

  async function handleConfirm() {
    setState("downloading");
    try {
      await downloadBackup();
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        onClick={() => setState("confirming")}
        aria-label={t("ariaLabel")}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        <HardDriveDownload size={18} />
      </button>

      {(state === "confirming" || state === "downloading" || state === "error") &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
            onClick={() => setState("idle")}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="backup-dialog-title"
              onKeyDown={(e) => e.key === "Escape" && setState("idle")}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                <HardDriveDownload size={22} />
              </div>
              <h2
                id="backup-dialog-title"
                className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100"
              >
                {t("dialogTitle")}
              </h2>
              <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
                {t("dialogDescription")}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setState("idle")}
                  disabled={state === "downloading"}
                  autoFocus
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={state === "downloading"}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {state === "downloading" ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t("downloading")}
                    </>
                  ) : (
                    t("confirm")
                  )}
                </button>
              </div>
              {state === "error" && (
                <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
                  {t("error")}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
