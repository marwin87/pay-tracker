"use client";

import { btnPrimaryClass } from "@/components/ui/formButtonClasses";
import { getCached, setCached } from "@/lib/page-cache";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, FileSpreadsheet, FileText, Loader2, Share2, X } from "lucide-react";
import { Fragment } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { todayIn } from "@/lib/today";
import { setOverdueBadge } from "@/lib/app-badge";
import {
  fetchPayments,
  syncInstances,
  type PaymentInstanceOut,
} from "@/lib/payments-api";
import {
  categoryFilterLabel,
  distinctCategories,
  sortCategoriesByLabel,
  type CategorySortOrder,
} from "@/lib/categories";
import Dropdown from "@/components/ui/Dropdown";
import { downloadPdf, downloadXlsx } from "@/lib/export-api";
import { fetchMe } from "@/lib/user-api";
import { SessionExpiredError, apiFetch } from "@/lib/api";
import PaymentRow from "@/components/payments/PaymentRow";
import PaymentsCalendar from "@/components/payments/PaymentsCalendar";
import MarkPaidDialog from "@/components/payments/MarkPaidDialog";
import ShareMonthDialog from "@/components/payments/ShareMonthDialog";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";
import RevertPaymentDialog from "@/components/payments/RevertPaymentDialog";
import FilterSelect from "@/components/FilterSelect";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import SearchInput from "@/components/SearchInput";
import { useCollapsedCategories, COLLAPSED_CATEGORIES_KEYS } from "@/hooks/useCollapsedCategories";
import { useSortOption } from "@/hooks/useSortOption";
import { toastName, useToast } from "@/context/toast-context";

type PaymentSortOption = "category-az" | "category-za" | "paid-first" | "unpaid-first";
const PAYMENT_SORT_OPTIONS: PaymentSortOption[] = [
  "category-az",
  "category-za",
  "paid-first",
  "unpaid-first",
];
import {
  PaymentActionProvider,
  usePaymentActions,
} from "@/context/payment-context";

type ExportScope = "month" | "year";

function getMonthLabel(year: number, monthIndex: number, locale: string): string {
  const label = new Intl.DateTimeFormat(locale, { month: "short" }).format(
    new Date(year, monthIndex),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthName(year: number, monthIndex: number, locale: string): string {
  const label = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(year, monthIndex));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function CategorySummary({
  group,
  todayStr,
  labels,
}: {
  group: PaymentInstanceOut[];
  todayStr: string;
  labels: {
    upcoming: string;
    overdueToday: string;
    overdue: string;
    paid: string;
  };
}) {
  const upcomingCount = group.filter((i) => i.status === "upcoming").length;
  const overdueTodayCount = group.filter(
    (i) => i.status === "overdue" && i.due_date === todayStr,
  ).length;
  const overdueOlderCount = group.filter(
    (i) => i.status === "overdue" && i.due_date < todayStr,
  ).length;
  const paidCount = group.filter((i) => i.status === "paid").length;

  const segments: { key: string; text: string; className: string }[] = [];
  if (upcomingCount > 0)
    segments.push({ key: "upcoming", text: `${upcomingCount} ${labels.upcoming}`, className: "text-slate-500 dark:text-slate-400" });
  if (overdueTodayCount > 0)
    segments.push({ key: "overdueToday", text: `${overdueTodayCount} ${labels.overdueToday}`, className: "text-orange-500 dark:text-orange-400" });
  if (overdueOlderCount > 0)
    segments.push({ key: "overdueOlder", text: `${overdueOlderCount} ${labels.overdue}`, className: "text-red-500 dark:text-red-400" });
  if (paidCount > 0)
    segments.push({ key: "paid", text: `${paidCount} ${labels.paid}`, className: "text-emerald-600 dark:text-emerald-400" });

  return (
    <span className="flex items-center gap-1 text-xs font-medium">
      {segments.map((seg, i) => (
        <Fragment key={seg.key}>
          {i > 0 && <span className="text-slate-300 dark:text-slate-600">·</span>}
          <span className={seg.className}>{seg.text}</span>
        </Fragment>
      ))}
    </span>
  );
}

export default function PaymentsPage() {
  return (
    <PaymentActionProvider>
      <PaymentsPageInner />
    </PaymentActionProvider>
  );
}

function PaymentsPageInner() {
  const t = useTranslations("PaymentsPage");
  const tRow = useTranslations("PaymentRow");
  const tCategories = useTranslations("Categories");
  const tFilters = useTranslations("Filters");
  const showToast = useToast();
  const locale = useLocale();

  // "Today" in the profile's zone, the same calendar the backend uses
  const { timeZone } = useAppLocale();
  const todayStr = todayIn(timeZone);
  const currentYear = Number(todayStr.slice(0, 4));
  const currentMonth = todayStr.slice(0, 7);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const {
    dialogTarget,
    setDialogTarget,
    deleteTarget,
    setDeleteTarget,
    revertTarget,
    setRevertTarget,
  } = usePaymentActions();
  const [editTarget, setEditTarget] = useState<PaymentInstanceOut | null>(null);
  const [instances, setInstances] = useState<PaymentInstanceOut[]>(
    () => getCached<PaymentInstanceOut[]>(`payments:${currentMonth}`) ?? [],
  );
  const [loadedMonth, setLoadedMonth] = useState<string | null>(() =>
    getCached(`payments:${currentMonth}`) === undefined ? null : currentMonth,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [xlsxError, setXlsxError] = useState<string | null>(null);
  const [exportEnabled, setExportEnabled] = useState(true);
  const [pdfEnabled, setPdfEnabled] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [shareAvailable, setShareAvailable] = useState(false);
  const [shareEmails, setShareEmails] = useState<string[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSent, setShareSent] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem("payments-calendar-open");
      return raw === null ? true : raw === "1";
    } catch {
      return true;
    }
  });

  function toggleCalendarOpen() {
    setCalendarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("payments-calendar-open", next ? "1" : "0");
      } catch {
        // ignore storage errors (e.g. private browsing quota)
      }
      return next;
    });
  }

  // Derived: true whenever selectedMonth hasn't finished loading yet.
  // Becomes true immediately when selectedMonth changes (same render), so no
  // synchronous setState inside useEffect is needed.
  const loading = loadedMonth !== selectedMonth;

  const isReadOnly = selectedMonth < currentMonth;

  // Keep the cache in step with local edits so a return visit never shows stale rows.
  useEffect(() => {
    if (!loading) setCached(`payments:${selectedMonth}`, instances);
  }, [instances, loading, selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    const isCurrentOrFuture = selectedMonth >= currentMonth;
    (isCurrentOrFuture ? syncInstances(selectedMonth).catch(() => {}) : Promise.resolve())
      .then(() => fetchPayments(selectedMonth))
      .then((data) => {
        if (!cancelled) {
          setInstances(data);
          setCached(`payments:${selectedMonth}`, data);
          setLoadError(null);
          setLoadedMonth(selectedMonth);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError) return;
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t("loadError"));
          setLoadedMonth(selectedMonth);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, currentMonth, t]);

  useEffect(() => {
    if (selectedMonth !== currentMonth || loading) return;
    setOverdueBadge(instances.filter((i) => i.status === "overdue").length);
  }, [instances, selectedMonth, currentMonth, loading]);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((profile) => {
        if (cancelled) return;
        setExportEnabled(profile.export_enabled);
        setPdfEnabled(profile.pdf_enabled);
        if (!profile.share_enabled) return;
        setShareEmails(profile.share_emails);
        return apiFetch<{ configured: boolean }>("/auth/smtp-status").then((d) => {
          if (!cancelled) setShareAvailable(d?.configured ?? false);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function handleInstancePaid(updated: PaymentInstanceOut) {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === updated.id ? updated : inst)),
    );
    setDialogTarget(null);
    showToast(t("paymentPaid", { name: toastName(updated.bill_name) }));
  }

  function handleInstanceEdited(updated: PaymentInstanceOut) {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === updated.id ? updated : inst)),
    );
    setEditTarget(null);
    showToast(t("paymentEdited", { name: toastName(updated.bill_name) }));
  }

  function handleInstanceDeleted(id: number) {
    const name = instances.find((inst) => inst.id === id)?.bill_name ?? "";
    setInstances((prev) => prev.filter((inst) => inst.id !== id));
    setDeleteTarget(null);
    showToast(t("paymentDeleted", { name: toastName(name) }));
  }

  function handleInstanceReverted(updated: PaymentInstanceOut) {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === updated.id ? updated : inst)),
    );
    setRevertTarget(null);
    showToast(t("paymentReverted", { name: toastName(updated.bill_name) }));
  }

  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Moving the year keeps the same month, so the list, export and share follow the header.
  function changeYear(delta: number) {
    const year = selectedYear + delta;
    setSelectedYear(year);
    setSelectedMonth(monthKey(year, Number(selectedMonth.slice(5, 7)) - 1));
  }

  // Mobile month picker: arrows step ±1 month (crossing years), the label opens a 4×3 grid.
  const [monthGridOpen, setMonthGridOpen] = useState(false);
  const selYear = Number(selectedMonth.slice(0, 4));
  const selMonthIdx = Number(selectedMonth.slice(5, 7)) - 1;
  function stepMonth(delta: number) {
    const d = new Date(selYear, selMonthIdx + delta);
    if (d.getFullYear() < currentYear - 2 || d.getFullYear() > currentYear + 1) return;
    setSelectedYear(d.getFullYear());
    setSelectedMonth(monthKey(d.getFullYear(), d.getMonth()));
  }

  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");


  // A day picked in a previous month has nothing to do with the month now
  // selected — treat it as cleared without a setState-in-effect round trip.
  const dayFilter = selectedDay && selectedDay.startsWith(selectedMonth) ? selectedDay : null;

  const statusCategoryFiltered = instances.filter(
    (inst) =>
      (statusFilter.size === 0 || statusFilter.has(inst.status)) &&
      (categoryFilter.size === 0 || categoryFilter.has(String(inst.category.id))),
  );
  const filteredInstances = statusCategoryFiltered
    .filter((inst) => dayFilter === null || inst.due_date === dayFilter)
    .filter(
      (inst) =>
        !searchQuery || inst.bill_name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const statusOptions = [
    { value: "upcoming", label: tRow("status.upcoming") },
    { value: "overdue", label: tRow("status.overdue") },
    { value: "paid", label: tRow("status.paid") },
  ];

  const categoryOptions = distinctCategories(instances, (inst) => inst.category).map((cat) => ({
    value: String(cat.id),
    label: categoryFilterLabel(cat, tCategories),
  }));

  const activeCategories = distinctCategories(filteredInstances, (inst) => inst.category);
  const activeCategoryKeys = activeCategories.map((cat) => String(cat.id));

  const { collapsed, toggle, collapseAll, expandAll, allCollapsed } =
    useCollapsedCategories(COLLAPSED_CATEGORIES_KEYS.payments, activeCategoryKeys);

  const [sortOption, setSortOption] = useSortOption<PaymentSortOption>(
    "payments-sort",
    "category-az",
    PAYMENT_SORT_OPTIONS,
  );
  const categorySortOrder: CategorySortOrder = sortOption === "category-za" ? "za" : "az";
  const sortedCategories = sortCategoriesByLabel(activeCategories, categorySortOrder, tCategories);
  const sortOptions = [
    { value: "category-az", label: tFilters("sortCategoryAsc") },
    { value: "category-za", label: tFilters("sortCategoryDesc") },
    { value: "paid-first", label: tFilters("sortPaidFirst") },
    { value: "unpaid-first", label: tFilters("sortUnpaidFirst") },
  ];

  async function handleExportXlsx(scope: ExportScope) {
    setXlsxError(null);
    setXlsxLoading(true);
    try {
      if (scope === "month") {
        await downloadXlsx(Number(selectedMonth.slice(0, 4)), locale, Number(selectedMonth.slice(5, 7)));
      } else {
        await downloadXlsx(selectedYear, locale);
      }
    } catch {
      setXlsxError(t("exportXlsxError"));
    } finally {
      setXlsxLoading(false);
    }
  }

  async function handleExportPdf(scope: ExportScope) {
    setPdfError(null);
    setPdfLoading(true);
    try {
      if (scope === "month") {
        await downloadPdf(Number(selectedMonth.slice(0, 4)), locale, Number(selectedMonth.slice(5, 7)));
      } else {
        await downloadPdf(selectedYear, locale);
      }
    } catch {
      setPdfError(t("exportPdfError"));
    } finally {
      setPdfLoading(false);
    }
  }

  const exportScopeOptions = [
    {
      value: "month" as const,
      label: t("exportXlsxMonth", {
        month: getMonthLabel(
          Number(selectedMonth.slice(0, 4)),
          Number(selectedMonth.slice(5, 7)) - 1,
          locale,
        ),
      }),
    },
    { value: "year" as const, label: t("exportXlsxYear", { year: selectedYear }) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-8">
      {dialogTarget && (
        <MarkPaidDialog
          instance={dialogTarget}
          isOpen={true}
          onClose={() => setDialogTarget(null)}
          onConfirm={handleInstancePaid}
        />
      )}
      {editTarget && (
        <MarkPaidDialog
          instance={editTarget}
          isOpen={true}
          mode="edit"
          onClose={() => setEditTarget(null)}
          onConfirm={handleInstanceEdited}
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
      {revertTarget && (
        <RevertPaymentDialog
          instance={revertTarget}
          isOpen={true}
          onClose={() => setRevertTarget(null)}
          onReverted={handleInstanceReverted}
        />
      )}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("subtitle")}
        </p>
      </div>

      {/* Month selector */}
      <div className="mb-6">
        {/* Mobile: ‹ Month Year ▾ › + 4×3 grid */}
        <div className="sm:hidden">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              onClick={() => stepMonth(-1)}
              aria-label={t("previousMonth")}
              disabled={selYear <= currentYear - 2 && selMonthIdx === 0}
              className="flex h-12 w-12 items-center justify-center rounded-xl text-slate-500 disabled:opacity-30 dark:text-slate-400"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setMonthGridOpen((o) => !o)}
              aria-expanded={monthGridOpen}
              className="flex h-12 flex-1 items-center justify-center gap-1.5 text-base font-semibold text-slate-700 dark:text-slate-200"
            >
              {monthName(selYear, selMonthIdx, locale)} {selYear}
              <ChevronDown size={16} className={`transition-transform ${monthGridOpen ? "rotate-180" : ""}`} />
            </button>
            <button
              onClick={() => stepMonth(1)}
              aria-label={t("nextMonth")}
              disabled={selYear >= currentYear + 1 && selMonthIdx === 11}
              className="flex h-12 w-12 items-center justify-center rounded-xl text-slate-500 disabled:opacity-30 dark:text-slate-400"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          {monthGridOpen && (
            <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800">
              {Array.from({ length: 12 }, (_, i) => {
                const key = monthKey(selYear, i);
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedMonth(key);
                      setMonthGridOpen(false);
                    }}
                    className={`rounded-xl py-3.5 text-sm font-medium ${
                      key === selectedMonth
                        ? "bg-green-100 text-green-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : key === currentMonth
                        ? "text-green-700 dark:text-emerald-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {getMonthLabel(selYear, i, locale)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="hidden sm:block">
        {/* Year navigation */}
        <div className="flex items-center gap-1 mb-3">
          <button
            onClick={() => changeYear(-1)}
            aria-label={t("previousYear")}
            disabled={selectedYear <= currentYear - 2}
            className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-lg font-semibold text-slate-700 dark:text-slate-200 w-14 text-center tabular-nums">
            {selectedYear}
          </span>
          <button
            onClick={() => changeYear(1)}
            aria-label={t("nextYear")}
            disabled={selectedYear >= currentYear + 1}
            className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Timeline strip */}
        <div className="relative">
          {/* Track */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex">
            {Array.from({ length: 12 }, (_, i) => {
              const key = monthKey(selectedYear, i);
              const isSelected = key === selectedMonth;
              const isCurrent = key === currentMonth;
              const isPast = key < currentMonth;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedMonth(key)}
                  className={`relative flex flex-1 flex-col items-center gap-1 pb-2.5 pt-2 text-sm font-medium transition-colors focus:outline-none ${
                    isSelected
                      ? "text-green-700 dark:text-emerald-400"
                      : isPast
                      ? "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  {isCurrent && (
                    <span className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500 dark:bg-emerald-400" />
                  )}
                  {getMonthLabel(selectedYear, i, locale)}
                  <span
                    className={`absolute bottom-0 left-1 right-1 h-0.5 rounded-full transition-all ${
                      isSelected ? "bg-green-600 dark:bg-emerald-500" : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        </div>

        {/* Export */}
        {(exportEnabled || pdfEnabled || shareAvailable) && (
          <div className="mt-4 flex items-center justify-end gap-3">
            {shareSent && (
              <p role="status" className="text-sm text-green-600 dark:text-emerald-400">
                {t("shareSent")}
              </p>
            )}
            {shareAvailable && (
              <button
                type="button"
                onClick={() => {
                  setShareSent(false);
                  setShareOpen(true);
                }}
                aria-label={t("shareMonth")}
                title={t("shareMonth")}
                className="flex items-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-green-700 dark:hover:bg-green-900/20 dark:hover:text-green-400"
              >
                <Share2 size={18} />
              </button>
            )}
            {exportEnabled && (
            <Dropdown<ExportScope | "">
              variant="icon"
              align="right"
              value=""
              onChange={(scope) => scope && handleExportXlsx(scope)}
              disabled={xlsxLoading}
              ariaLabel={t("exportXlsx")}
              placeholder={
                <span className="flex items-center gap-1.5">
                  {xlsxLoading ? (
                    <Loader2 size={16} className="animate-spin text-green-600 dark:text-emerald-400" />
                  ) : (
                    <FileSpreadsheet size={16} />
                  )}
                  XLSX
                </span>
              }
              options={exportScopeOptions}
            />
            )}
            {pdfEnabled && (
            <Dropdown<ExportScope | "">
              variant="icon"
              align="right"
              value=""
              onChange={(scope) => scope && handleExportPdf(scope)}
              disabled={pdfLoading}
              ariaLabel={t("exportPdf")}
              placeholder={
                <span className="flex items-center gap-1.5">
                  {pdfLoading ? (
                    <Loader2 size={16} className="animate-spin text-green-600 dark:text-emerald-400" />
                  ) : (
                    <FileText size={16} />
                  )}
                  PDF
                </span>
              }
              options={exportScopeOptions}
            />
            )}
            {(xlsxError || pdfError) && (
              <p className="text-sm text-red-600 dark:text-red-400">{xlsxError ?? pdfError}</p>
            )}
          </div>
        )}

        {shareOpen && (
          <ShareMonthDialog
            month={selectedMonth}
            savedEmails={shareEmails}
            monthLabel={new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
              new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1),
            )}
            onClose={() => setShareOpen(false)}
            onSent={() => {
              setShareOpen(false);
              setShareSent(true);
            }}
          />
        )}

        {/* Calendar view */}
        <div className="mt-4">
          <button
            type="button"
            onClick={toggleCalendarOpen}
            aria-expanded={calendarOpen}
            className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <ChevronRight
              size={12}
              className={`transition-transform duration-150 ${calendarOpen ? "rotate-90" : ""}`}
            />
            {t("calendarTitle")}
          </button>
          {calendarOpen && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <PaymentsCalendar
                year={parseInt(selectedMonth.split("-")[0], 10)}
                month={parseInt(selectedMonth.split("-")[1], 10)}
                instances={statusCategoryFiltered}
                todayStr={todayStr}
                selectedDay={dayFilter}
                onSelectDay={(d) => setSelectedDay((prev) => (prev === d ? null : d))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Selected month header */}
      <div className="mb-4 pb-2">
        <div className="flex items-center justify-between gap-2">
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
        </div>
        {!loading && !loadError && (
          <div className="mt-0.5 flex flex-col gap-3">
            {filteredInstances.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {instances.length === 0 ? t("noPayments") : t("noFilterResults")}
              </p>
            ) : (
              <CategorySummary
                group={filteredInstances}
                todayStr={todayStr}
                labels={{
                  upcoming: t("summaryUpcoming"),
                  overdueToday: t("summaryOverdueToday"),
                  overdue: t("summaryOverdue"),
                  paid: t("summaryPaid"),
                }}
              />
            )}
            <p className="-mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{tFilters("toolbarTitle")}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={tFilters("searchPlaceholder")}
              />
              <div className="grid w-full grid-cols-1 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-3">
                <div className="flex min-w-0 items-center gap-2 max-sm:[&>div]:min-w-0 max-sm:[&>div]:flex-1 max-sm:[&_button]:w-full max-sm:[&_button]:justify-between">
                  <span className="max-sm:sr-only text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {tFilters("filterBy")}
                  </span>
                  <MultiSelectFilter
                    selected={statusFilter}
                    onChange={setStatusFilter}
                    options={categoryOptions.length ? statusOptions : []}
                    ariaLabel={tFilters("allStatuses")}
                    allLabel={tFilters("allStatuses")}
                  />
                  <MultiSelectFilter
                    selected={categoryFilter}
                    onChange={setCategoryFilter}
                    options={categoryOptions}
                    ariaLabel={tFilters("allCategories")}
                    allLabel={tFilters("allCategories")}
                  />
                </div>
                <div className="hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
                <div className="flex min-w-0 items-center gap-2 max-sm:[&>div]:min-w-0 max-sm:[&>div]:flex-1 max-sm:[&_button]:w-full max-sm:[&_button]:justify-between">
                  <span className="max-sm:sr-only text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {tFilters("sortBy")}
                  </span>
                  <FilterSelect
                    value={sortOption}
                    onChange={(v) => setSortOption(v as PaymentSortOption)}
                    options={sortOptions}
                    ariaLabel={tFilters("sortBy")}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="border-t border-slate-200 dark:border-slate-700 sm:h-px sm:w-1/2 sm:self-end sm:border-t-0 sm:bg-gradient-to-r sm:from-transparent sm:to-slate-300 dark:sm:to-slate-600" />
              <button
                onClick={allCollapsed ? expandAll : collapseAll}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200 w-full justify-center sm:w-auto sm:self-end"
              >
                <ChevronsUpDown size={16} />
                {allCollapsed ? t("expandAll") : t("collapseAll")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Day filter banner: sticky so it stays visible once the calendar has scrolled away */}
      {dayFilter && !loading && !loadError && (
        <div className="sticky top-[57px] z-[5] mb-4 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700 shadow-sm md:top-0 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
          <CalendarDays size={20} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {t("dayFilterTitle", {
                date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
                  new Date(dayFilter + "T00:00:00"),
                ),
              })}
            </p>
            <p className="text-xs opacity-75">
              {t("dayFilterCount", { count: filteredInstances.length, total: instances.length })}
            </p>
          </div>
          <button
            onClick={() => setSelectedDay(null)}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200"
          >
            <X size={12} />
            {t("clearDayFilter")}
          </button>
        </div>
      )}

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
      {!loading && !loadError && filteredInstances.length > 0 && (
        <div className="flex flex-col gap-4">
          {sortedCategories.map((cat) => {
            const key = String(cat.id);
            const group = filteredInstances.filter((inst) => inst.category.id === cat.id);
            if (sortOption === "paid-first" || sortOption === "unpaid-first") {
              const sign = sortOption === "paid-first" ? -1 : 1;
              group.sort(
                (a, b) => (Number(a.status === "paid") - Number(b.status === "paid")) * sign,
              );
            }
            return (
              <div key={key}>
                <button
                  onClick={() => toggle(key)}
                  className="mb-3 flex w-full items-center gap-2.5 text-left"
                >
                  <ChevronRight
                    size={12}
                    className={`shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-150 ${
                      collapsed.has(key) ? "" : "rotate-90"
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
                    {categoryFilterLabel(cat, tCategories)}
                  </span>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-xs font-semibold text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                    {group.length}
                  </span>
                  {collapsed.has(key) && (
                    <CategorySummary
                      group={group}
                      todayStr={todayStr}
                      labels={{
                        upcoming: t("summaryUpcoming"),
                        overdueToday: t("summaryOverdueToday"),
                        overdue: t("summaryOverdue"),
                        paid: t("summaryPaid"),
                      }}
                    />
                  )}
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700/60" />
                </button>
                {!collapsed.has(key) && (
                  <div className="flex flex-col gap-2">
                    {group.map((inst) => (
                      <PaymentRow
                        key={inst.id}
                        instance={inst}
                        readOnly={false}
                        onMarkPaid={setDialogTarget}
                        onDelete={setDeleteTarget}
                        onRevert={setRevertTarget}
                        onEdit={setEditTarget}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && filteredInstances.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {instances.length === 0 ? t("noPayments") : t("noFilterResults")}
          </p>
          {instances.length === 0 && !isReadOnly && (
            <>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{t("emptyHelp")}</p>
              <Link href="/dashboard/bills" className={`mt-4 ${btnPrimaryClass}`}>
                {t("addBills")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
