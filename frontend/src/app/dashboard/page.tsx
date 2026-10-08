"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useLocale as useAppLocale } from "@/context/locale-context";
import { monthIn } from "@/lib/today";
import { SessionExpiredError } from "@/lib/api";
import {
  fetchPayments,
  fetchTrend,
  syncInstances,
  type PaymentInstanceOut,
  type TrendPoint,
} from "@/lib/payments-api";
import { fetchMe } from "@/lib/user-api";
import { getCached, setCached } from "@/lib/page-cache";
import { btnPrimaryClass } from "@/components/ui/formButtonClasses";
import { currenciesByVolume, pickCurrency, summarize } from "@/lib/summary";
import MonthSummaryCard, { CARD_CLASS } from "@/components/dashboard/MonthSummaryCard";
import CategoryDonut from "@/components/dashboard/CategoryDonut";
import TrendChart from "@/components/dashboard/TrendChart";
import MonthNav from "@/components/dashboard/MonthNav";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const { timeZone } = useAppLocale();
  const currentMonth = monthIn(timeZone);
  // Same reach as the Payments page year switcher: two years back from this year.
  const minMonth = `${Number(currentMonth.slice(0, 4)) - 2}-01`;
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<{
    month: string;
    instances: PaymentInstanceOut[];
    trend: TrendPoint[];
    defaultCurrency: string | null;
  } | null>(() => getCached(`dashboard:${currentMonth}`) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Sync first so this month's payments exist, exactly like the Payments page.
    // Past months are history: never generate instances for them.
    (month >= currentMonth ? syncInstances(month).catch(() => {}) : Promise.resolve())
      .then(() =>
        Promise.all([
          fetchPayments(month),
          fetchTrend(month),
          fetchMe().then((me) => me.default_currency).catch(() => null),
        ]),
      )
      .then(([instances, trend, defaultCurrency]) => {
        if (cancelled) return;
        const next = { month, instances, trend, defaultCurrency };
        setCached(`dashboard:${month}`, next);
        setData(next);
      })
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError || cancelled) return;
        setError(err instanceof Error ? err.message : t("summary.loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [month, currentMonth, t]);

  const currencies = data ? currenciesByVolume(data.instances, data.trend) : [];
  const currency = data ? pickCurrency(selectedCurrency, currencies, data.defaultCurrency) : null;
  const summary = data && currency ? summarize(data.instances, currency) : null;
  // Label and chart follow the month the data was loaded for, not the one just clicked.
  const shownMonth = data?.month ?? month;
  const [yy, mm] = shownMonth.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(yy, mm - 1));

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-10">
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 mb-8">
        {t("subtitle")}
      </p>

      {error && (
        <p className="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
      {!data && !error && (
        <div className="mb-8 flex flex-col gap-4" aria-busy="true" aria-label={t("summary.loading")}>
          <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      )}
      {data && !currency && (
        // No payments in any currency for this window: keep the month nav so you can go back
        <section className={CARD_CLASS}>
          <MonthNav month={month} currentMonth={currentMonth} minMonth={minMonth} monthLabel={monthLabel} onChange={setMonth} />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("summary.emptyMonth")}</p>
          {month >= currentMonth && (
            <>
              <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{t("summary.emptyHelp")}</p>
              <Link href="/dashboard/bills" className={`mt-4 ${btnPrimaryClass}`}>
                {t("summary.addBill")}
              </Link>
            </>
          )}
        </section>
      )}
      {data && summary && currency && (
        <div className="mb-8 flex flex-col gap-4">
          {currencies.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("summary.currency")}
              </span>
              <div role="group" aria-label={t("summary.currency")} className="flex flex-wrap items-center gap-2">
                {currencies.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={c === currency}
                    onClick={() => setSelectedCurrency(c)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      c === currency
                        ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "border-slate-200 bg-white text-slate-600 hover:border-green-200 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-800 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          <MonthSummaryCard
            summary={summary}
            currency={currency}
            title={
              <MonthNav
                month={shownMonth}
                currentMonth={currentMonth}
                minMonth={minMonth}
                monthLabel={monthLabel}
                onChange={setMonth}
              />
            }
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <CategoryDonut rows={summary.byCategory} currency={currency} monthLabel={monthLabel} />
            <TrendChart points={data.trend} currency={currency} month={shownMonth} />
          </div>
        </div>
      )}
    </div>
  );
}
