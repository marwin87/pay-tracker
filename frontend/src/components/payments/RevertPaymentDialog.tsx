"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { revertPay, type PaymentInstanceOut } from "@/lib/payments-api";

interface Props {
  instance: PaymentInstanceOut;
  isOpen: boolean;
  onClose: () => void;
  onReverted: (updated: PaymentInstanceOut) => void;
}

export default function RevertPaymentDialog({
  instance,
  isOpen,
  onClose,
  onReverted,
}: Props) {
  const t = useTranslations("RevertPaymentDialog");
  const [isReverting, setIsReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  if (!isOpen) return null;

  async function handleConfirm() {
    setIsReverting(true);
    setError(null);
    try {
      const updated = await revertPay(instance.id);
      if (mounted.current) onReverted(updated);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : t("revertFailed"));
      setIsReverting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="revert-payment-dialog-title"
        onKeyDown={(e) => e.key === "Escape" && !isReverting && onClose()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <Undo2 size={22} />
        </div>

        <h2
          id="revert-payment-dialog-title"
          className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100"
        >
          {t("title")}
        </h2>

        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          {instance.bill_name}
        </p>

        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
          {t("description")}
        </p>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isReverting}
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isReverting}
            className="flex-1 rounded-lg border border-amber-200 bg-white py-2.5 text-sm font-medium text-amber-600 shadow-sm transition-all hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50 dark:border-amber-800 dark:bg-slate-800 dark:text-amber-400 dark:hover:border-amber-700 dark:hover:bg-amber-900/20 dark:hover:text-amber-300"
          >
            {isReverting ? t("reverting") : t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
