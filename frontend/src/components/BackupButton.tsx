"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { HardDriveDownload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BACKUP_SECTIONS, BackupSection, downloadBackup } from "@/lib/export-api";

type State = "idle" | "confirming" | "downloading" | "warning" | "error";

export default function BackupButton({ label }: { label?: string } = {}) {
  const t = useTranslations("BackupButton");
  const [state, setState] = useState<State>("idle");
  const [selected, setSelected] = useState<Set<BackupSection>>(
    () => new Set(BACKUP_SECTIONS)
  );
  const allSelected = selected.size === BACKUP_SECTIONS.length;

  function toggle(section: BackupSection) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(section)) next.add(section);
      return next;
    });
  }

  async function handleConfirm() {
    setState("downloading");
    try {
      const { telegramTokenUnreadable } = await downloadBackup(
        BACKUP_SECTIONS.filter((s) => selected.has(s))
      );
      setState(telegramTokenUnreadable ? "warning" : "idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        onClick={() => setState("confirming")}
        aria-label={t("ariaLabel")}
        className={
          label
            ? "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            : "rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
        }
      >
        <HardDriveDownload size={18} />
        {label && <span>{label}</span>}
      </button>

      {(state === "confirming" ||
        state === "downloading" ||
        state === "warning" ||
        state === "error") &&
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
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <HardDriveDownload size={22} />
              </div>
              <h2
                id="backup-dialog-title"
                className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100"
              >
                {t("dialogTitle")}
              </h2>
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                {t("dialogDescription")}
              </p>
              {state !== "warning" && (
                <fieldset className="mb-6 space-y-2" disabled={state === "downloading"}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(BACKUP_SECTIONS))
                    }
                    className="text-xs font-medium text-green-700 hover:underline dark:text-emerald-400"
                  >
                    {allSelected ? t("deselectAll") : t("selectAll")}
                  </button>
                  {BACKUP_SECTIONS.map((section) => (
                    <label
                      key={section}
                      className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(section)}
                        onChange={() => toggle(section)}
                        className="h-4 w-4 accent-green-600"
                      />
                      {t(`sections.${section}`)}
                    </label>
                  ))}
                </fieldset>
              )}
              {state === "warning" ? (
                <>
                  <p className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                    {t("telegramWarning")}
                  </p>
                  <button
                    onClick={() => setState("idle")}
                    autoFocus
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {t("ok")}
                  </button>
                </>
              ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => setState("idle")}
                  disabled={state === "downloading"}
                  autoFocus
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={state === "downloading" || selected.size === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-green-200 bg-white py-2.5 text-sm font-medium text-green-700 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-800 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
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
              )}
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
