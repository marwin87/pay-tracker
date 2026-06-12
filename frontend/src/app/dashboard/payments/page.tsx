"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  fetchPayments,
  type PaymentInstanceOut,
} from "@/lib/payments-api";
import PaymentRow from "@/components/payments/PaymentRow";
import MarkPaidDialog from "@/components/payments/MarkPaidDialog";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(year: number, monthIndex: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(
    new Date(year, monthIndex),
  );
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export default function PaymentsPage() {
  const t = useTranslations("PaymentsPage");
  const locale = useLocale();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = getCurrentMonth();

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth);
  const [instances, setInstances] = useState<PaymentInstanceOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogTarget, setDialogTarget] = useState<PaymentInstanceOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentInstanceOut | null>(null);

  const isReadOnly = selectedMonth < currentMonth;

  useEffect(() => {
    let cancelled = false;
    fetchPayments(selectedMonth)
      .then((data) => {
        if (!cancelled) {
          setInstances(data);
          setLoadError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t("loadError"));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, t]);

  function handleInstancePaid(updated: PaymentInstanceOut) {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === updated.id ? updated : inst)),
    );
    setDialogTarget(null);
  }

  function handleInstanceDeleted(id: number) {
    setInstances((prev) => prev.filter((inst) => inst.id !== id));
    setDeleteTarget(null);
  }

  const years = [currentYear, currentYear - 1];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {dialogTarget && (
        <MarkPaidDialog
          instance={dialogTarget}
          isOpen={true}
          onClose={() => setDialogTarget(null)}
          onConfirm={handleInstancePaid}
        />
      )}
      {deleteTarget && (
        <DeletePaymentDialog
          instance={deleteTarget}
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleInstanceDeleted}
        />
      )}

      {/* Page header */}
      <h1 className="mb-6 text-2xl font-semibold text-slate-800 dark:text-slate-100">
        {t("title")}
      </h1>

      {/* Year-month selector */}
      <div className="mb-6 space-y-3">
        {years.map((year) => (
          <div key={year}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {year}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 12 }, (_, i) => {
                const key = monthKey(year, i);
                const isSelected = key === selectedMonth;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedMonth(key)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    }`}
                  >
                    {getMonthLabel(year, i, locale)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Payment list */}
      {!loading && !loadError && instances.length > 0 && (
        <div className="flex flex-col gap-2">
          {instances.map((inst) => (
            <PaymentRow
              key={inst.id}
              instance={inst}
              readOnly={isReadOnly}
              onMarkPaid={setDialogTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && instances.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {t("noPayments")}
          </p>
          {!isReadOnly && (
            <Link
              href="/dashboard/bills"
              className="mt-3 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {t("addBills")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
