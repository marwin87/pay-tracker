"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsUpDown, Download, Loader2 } from "lucide-react";
import { Fragment } from "react";
import { useTranslations, useLocale } from "next-intl";
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
import { downloadXlsx } from "@/lib/export-api";
import { SessionExpiredError } from "@/lib/api";
import PaymentRow from "@/components/payments/PaymentRow";
import PaymentsCalendar from "@/components/payments/PaymentsCalendar";
import MarkPaidDialog from "@/components/payments/MarkPaidDialog";
import DeletePaymentDialog from "@/components/payments/DeletePaymentDialog";
import RevertPaymentDialog from "@/components/payments/RevertPaymentDialog";
import FilterSelect from "@/components/FilterSelect";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import { useCollapsedCategories } from "@/hooks/useCollapsedCategories";
import { useSortOption } from "@/hooks/useSortOption";

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

function getTodayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const locale = useLocale();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = getCurrentMonth();

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth);
  const {
    dialogTarget,
    setDialogTarget,
    deleteTarget,
    setDeleteTarget,
    revertTarget,
    setRevertTarget,
  } = usePaymentActions();
  const [instances, setInstances] = useState<PaymentInstanceOut[]>([]);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [xlsxLoadingYear, setXlsxLoadingYear] = useState<number | null>(null);
  const [xlsxError, setXlsxError] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    const isCurrentOrFuture = selectedMonth >= currentMonth;
    (isCurrentOrFuture ? syncInstances(selectedMonth).catch(() => {}) : Promise.resolve())
      .then(() => fetchPayments(selectedMonth))
      .then((data) => {
        if (!cancelled) {
          setInstances(data);
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
    setRevertTarget(null);
  }

  const [selectedYear, setSelectedYear] = useState(currentYear);

  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());

  const todayStr = getTodayStr();

  // A day picked in a previous month has nothing to do with the month now
  // selected — treat it as cleared without a setState-in-effect round trip.
  const dayFilter = selectedDay && selectedDay.startsWith(selectedMonth) ? selectedDay : null;

  const statusCategoryFiltered = instances.filter(
    (inst) =>
      (statusFilter.size === 0 || statusFilter.has(inst.status)) &&
      (categoryFilter.size === 0 || categoryFilter.has(String(inst.category.id))),
  );
  const filteredInstances = statusCategoryFiltered.filter(
    (inst) => dayFilter === null || inst.due_date === dayFilter,
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
    useCollapsedCategories("payments-collapsed-categories", activeCategoryKeys);

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

  async function handleExportXlsx(year: number) {
    setXlsxError(null);
    setXlsxLoadingYear(year);
    try {
      await downloadXlsx(year, locale);
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
        {/* Year navigation */}
        <div className="flex items-center gap-1 mb-3">
          <button
            onClick={() => setSelectedYear((y) => y - 1)}
            disabled={selectedYear <= currentYear - 2}
            className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-lg font-semibold text-slate-700 dark:text-slate-200 w-14 text-center tabular-nums">
            {selectedYear}
          </span>
          <button
            onClick={() => setSelectedYear((y) => y + 1)}
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

        {/* Export */}
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            onClick={() => handleExportXlsx(selectedYear)}
            disabled={xlsxLoadingYear !== null}
            className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
          >
            {xlsxLoadingYear === selectedYear ? (
              <Loader2 size={15} className="animate-spin text-green-600 dark:text-emerald-400" />
            ) : (
              <Download size={15} className="transition-transform group-hover:-translate-y-0.5" />
            )}
            {xlsxLoadingYear === selectedYear ? t("exportXlsxLoading") : t("exportXlsx")}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-400 dark:bg-slate-700 dark:text-slate-500">
              {selectedYear}
            </span>
          </button>
          {xlsxError && (
            <p className="text-sm text-red-600 dark:text-red-400">{xlsxError}</p>
          )}
        </div>

        {/* Calendar view */}
        <div className="mt-4">
          <button
            type="button"
            onClick={toggleCalendarOpen}
            aria-expanded={calendarOpen}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <ChevronRight
              size={14}
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
              {dayFilter && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
                      new Date(dayFilter + "T00:00:00"),
                    )}
                  </span>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="text-green-700 hover:underline dark:text-emerald-400"
                  >
                    {t("clearDayFilter")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selected month header */}
      <div className="mb-4 pb-5 border-b border-slate-200 dark:border-slate-700">
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
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {tFilters("filterBy")}
                </span>
                <MultiSelectFilter
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
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
              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {tFilters("sortBy")}
                </span>
                <FilterSelect
                  value={sortOption}
                  onChange={(v) => setSortOption(v as PaymentSortOption)}
                  options={sortOptions}
                  ariaLabel={tFilters("sortBy")}
                />
              </div>
              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
              <button
                onClick={allCollapsed ? expandAll : collapseAll}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
              >
                <ChevronsUpDown size={13} />
                {allCollapsed ? t("expandAll") : t("collapseAll")}
              </button>
            </div>
          </div>
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
                        onEdit={setDialogTarget}
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
