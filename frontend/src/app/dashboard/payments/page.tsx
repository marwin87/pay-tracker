"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  fetchPayments,
  type PaymentInstanceOut,
} from "@/lib/payments-api";
import { downloadXlsx } from "@/lib/export-api";
import PaymentRow from "@/components/payments/PaymentRow";
import MarkPaidDialog from "@/components/payments/MarkPaidDialog";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(year: number, monthIndex: number, locale: string): string {
  const label = new Intl.DateTimeFormat(locale, { month: "short" }).format(
    new Date(year, monthIndex),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export default function PaymentsPage() {
  const t = useTranslations("PaymentsPage");
  const tRow = useTranslations("PaymentRow");
  const locale = useLocale();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = getCurrentMonth();

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth);
  const [instances, setInstances] = useState<PaymentInstanceOut[]>([]);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogTarget, setDialogTarget] = useState<PaymentInstanceOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentInstanceOut | null>(null);
  const [xlsxLoadingYear, setXlsxLoadingYear] = useState<number | null>(null);
  const [xlsxError, setXlsxError] = useState<string | null>(null);

  // Derived: true whenever selectedMonth hasn't finished loading yet.
  // Becomes true immediately when selectedMonth changes (same render), so no
  // synchronous setState inside useEffect is needed.
  const loading = loadedMonth !== selectedMonth;

  const isReadOnly = selectedMonth < currentMonth;

  useEffect(() => {
    let cancelled = false;
    fetchPayments(selectedMonth)
      .then((data) => {
        if (!cancelled) {
          setInstances(data);
          setLoadError(null);
          setLoadedMonth(selectedMonth);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t("loadError"));
          setLoadedMonth(selectedMonth);
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

  function handleInstanceReverted(updated: PaymentInstanceOut) {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === updated.id ? updated : inst)),
    );
  }

  const years = [currentYear, currentYear - 1];
  const [selectedYear, setSelectedYear] = useState(currentYear);

  async function handleExportXlsx(year: number) {
    setXlsxError(null);
    setXlsxLoadingYear(year);
    try {
      await downloadXlsx(year);
    } catch {
      setXlsxError(t("exportXlsxError"));
    } finally {
      setXlsxLoadingYear(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
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

      {/* Year-month selector + export */}
      <div className="mb-6">
        {/* Year dropdown */}
        <div className="mb-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-green-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        {/* Month buttons */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 12 }, (_, i) => {
            const key = monthKey(selectedYear, i);
            const isSelected = key === selectedMonth;
            return (
              <button
                key={key}
                onClick={() => setSelectedMonth(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isSelected
                    ? "bg-green-700 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                }`}
              >
                {getMonthLabel(selectedYear, i, locale)}
              </button>
            );
          })}
        </div>
        {/* Separator + export */}
        <hr className="my-3 border-slate-200 dark:border-slate-700" />
        <button
          onClick={() => handleExportXlsx(selectedYear)}
          disabled={xlsxLoadingYear !== null}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {xlsxLoadingYear === selectedYear ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Download size={15} />
          )}
          {xlsxLoadingYear === selectedYear ? t("exportXlsxLoading") : t("exportXlsx")}
        </button>
        {xlsxError && (
          <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{xlsxError}</p>
        )}
      </div>

      {/* Selected month header */}
      <div className="mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {(() => {
              const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
                new Date(
                  parseInt(selectedMonth.split("-")[0]),
                  parseInt(selectedMonth.split("-")[1]) - 1,
                ),
              );
              return label.charAt(0).toUpperCase() + label.slice(1);
            })()}
          </h2>
          {isReadOnly && (
            <span className="rounded-md px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {t("pastMonth")}
            </span>
          )}
        </div>
        {!loading && !loadError && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {instances.length === 0
              ? t("noPayments")
              : [
                  instances.filter((i) => i.status === "upcoming").length > 0 &&
                    `${instances.filter((i) => i.status === "upcoming").length} ${tRow("status.upcoming").toLowerCase()}`,
                  instances.filter((i) => i.status === "overdue").length > 0 &&
                    `${instances.filter((i) => i.status === "overdue").length} ${tRow("status.overdue").toLowerCase()}`,
                  instances.filter((i) => i.status === "paid").length > 0 &&
                    `${instances.filter((i) => i.status === "paid").length} ${tRow("status.paid").toLowerCase()}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        )}
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
              onReverted={handleInstanceReverted}
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
              className="mt-3 text-sm font-medium text-green-700 hover:underline dark:text-green-500"
            >
              {t("addBills")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
