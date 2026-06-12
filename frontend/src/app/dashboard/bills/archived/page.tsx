"use client";

import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { fetchBills, type BillTemplateOut } from "@/lib/bills-api";

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  one_off: "One-off",
};

export default function ArchivedBillsPage() {
  const [templates, setTemplates] = useState<BillTemplateOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBills(true)
      .then((data) => {
        if (!cancelled) {
          setTemplates(data.filter((t) => t.is_archived));
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load archived bills.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          Archived Bills
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Payment history is preserved for all archived bills.
        </p>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse"
            />
          ))}
        </div>
      )}

      {loadError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {loadError}
        </div>
      )}

      {!loading && !loadError && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <div className="mb-3 rounded-full bg-slate-100 dark:bg-slate-700 p-4 text-slate-400">
            <Archive size={28} />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">No archived bills</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bills you archive will appear here
          </p>
        </div>
      )}

      {!loading && templates.length > 0 && (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 opacity-70 dark:bg-slate-800 dark:border-slate-700"
            >
              <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                  {t.name}
                </span>
                <span className="text-slate-600 dark:text-slate-400">€{t.amount}</span>
                <span className="text-sm text-slate-400 dark:text-slate-500">
                  {FREQUENCY_LABEL[t.frequency] ?? t.frequency}
                </span>
                {t.category && (
                  <span className="text-sm text-slate-400 dark:text-slate-500">
                    {t.category}
                  </span>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                Archived
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
