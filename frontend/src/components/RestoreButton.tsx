"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HardDriveUpload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { restoreFromBackup } from "@/lib/export-api";

type State = "idle" | "confirming" | "restoring" | "error";

export default function RestoreButton({ label }: { label?: string } = {}) {
  const t = useTranslations("RestoreButton");
  const [state, setState] = useState<State>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleButtonClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(t("fileTooLarge"));
      setState("error");
      return;
    }
    setSelectedFile(file);
    setState("confirming");
  }

  function handleCancel() {
    setState("idle");
    setSelectedFile(null);
    setErrorMsg("");
  }

  async function handleConfirm() {
    if (!selectedFile) return;
    setState("restoring");
    try {
      await restoreFromBackup(selectedFile);
      setState("idle");
      setSelectedFile(null);
      // Reload page so dashboard reflects restored data
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("error"));
      setState("error");
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        onClick={handleButtonClick}
        aria-label={t("ariaLabel")}
        className={
          label
            ? "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 transition-colors"
            : "rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
        }
      >
        <HardDriveUpload size={18} />
        {label && <span>{label}</span>}
      </button>

      {(state === "confirming" || state === "restoring" || state === "error") &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
            onClick={handleCancel}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="restore-dialog-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <HardDriveUpload size={22} />
              </div>
              <h2
                id="restore-dialog-title"
                className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100"
              >
                {t("dialogTitle")}
              </h2>
              <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
                {t("dialogDescription", { filename: selectedFile?.name ?? "" })}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  onKeyDown={(e) => e.key === "Escape" && handleCancel()}
                  disabled={state === "restoring"}
                  autoFocus
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={state === "restoring"}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {state === "restoring" ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t("restoring")}
                    </>
                  ) : (
                    t("confirm")
                  )}
                </button>
              </div>
              {state === "error" && (
                <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
                  {errorMsg || t("error")}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
