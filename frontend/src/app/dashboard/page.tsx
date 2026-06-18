"use client";

import Link from "next/link";
import { Receipt, Archive, CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
        {t("title")}
      </h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8">
        {t("subtitle")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/payments"
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all dark:bg-slate-800 dark:border-slate-700 dark:hover:border-emerald-500"
        >
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600 group-hover:bg-emerald-200 transition-colors dark:bg-emerald-900/40 dark:text-emerald-400">
            <CreditCard size={24} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {t("paymentsTitle")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t("paymentsDesc")}
            </p>
          </div>
        </Link>

        <Link
          href="/dashboard/bills"
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all dark:bg-slate-800 dark:border-slate-700 dark:hover:border-blue-500"
        >
          <div className="rounded-xl bg-blue-100 p-3 text-blue-600 group-hover:bg-blue-200 transition-colors dark:bg-blue-900/40 dark:text-blue-400">
            <Receipt size={24} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {t("manageBillsTitle")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t("manageBillsDesc")}
            </p>
          </div>
        </Link>

        <Link
          href="/dashboard/bills/archived"
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:shadow-md transition-all dark:bg-slate-800 dark:border-slate-700"
        >
          <div className="rounded-xl bg-slate-100 p-3 text-slate-500 group-hover:bg-slate-200 transition-colors dark:bg-slate-700 dark:text-slate-400">
            <Archive size={24} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {t("archivedBillsTitle")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t("archivedBillsDesc")}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
