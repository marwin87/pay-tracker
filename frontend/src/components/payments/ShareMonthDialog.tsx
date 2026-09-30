"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { shareMonthByEmail } from "@/lib/user-api";
import { Input } from "@/components/ui/Input";

interface Props {
  month: string; // YYYY-MM
  monthLabel: string;
  onClose: () => void;
  onSent: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ShareMonthDialog({ month, monthLabel, onClose, onSent }: Props) {
  const t = useTranslations("ShareMonthDialog");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_RE.test(email.trim());

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const { sent } = await shareMonthByEmail(email.trim(), month);
      if (sent) onSent();
      else {
        setError(t("failed"));
        setSending(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
      setSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-month-dialog-title"
        onKeyDown={(e) => e.key === "Escape" && !sending && onClose()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800 dark:border-slate-700"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Mail size={22} />
        </div>
        <h2
          id="share-month-dialog-title"
          className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100"
        >
          {t("title")}
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {t("description", { month: monthLabel })}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !sending) handleSend();
          }}
        >
          <label
            htmlFor="share-month-email"
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {t("emailLabel")}
          </label>
          <Input
            id="share-month-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            disabled={sending}
            className="mb-5"
          />
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              autoFocus
              onClick={onClose}
              disabled={sending}
              className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={!valid || sending}
              className="flex-1 rounded-lg border border-transparent bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50"
            >
              {sending ? t("sending") : t("send")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
