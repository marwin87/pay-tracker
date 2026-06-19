"use client";

import Link from "next/link";
import { Receipt, Archive, CreditCard, Settings } from "lucide-react";
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
          className="group flex items-start gap-4 rounded-xl border border-slate-200 border-l-4 border-l-emerald-400 bg-white p-5 shadow-sm transition-all hover:border-l-emerald-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:border-l-emerald-500 dark:hover:bg-slate-700/50"
        >
          <div className="rounded-lg bg-emerald-100 p-2.5 text-emerald-600 transition-colors group-hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400">
            <CreditCard size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {t("paymentsTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("paymentsDesc")}
            </p>
          </div>
        </Link>

        <Link
          href="/dashboard/bills"
          className="group flex items-start gap-4 rounded-xl border border-slate-200 border-l-4 border-l-blue-400 bg-white p-5 shadow-sm transition-all hover:border-l-blue-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:border-l-blue-500 dark:hover:bg-slate-700/50"
        >
          <div className="rounded-lg bg-blue-100 p-2.5 text-blue-600 transition-colors group-hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-400">
            <Receipt size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {t("manageBillsTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("manageBillsDesc")}
            </p>
          </div>
        </Link>

        <Link
          href="/dashboard/bills/archived"
          className="group flex items-start gap-4 rounded-xl border border-slate-200 border-l-4 border-l-slate-300 bg-white p-5 shadow-sm transition-all hover:border-l-slate-400 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:border-l-slate-600 dark:hover:bg-slate-700/50"
        >
          <div className="rounded-lg bg-slate-100 p-2.5 text-slate-500 transition-colors group-hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400">
            <Archive size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {t("archivedBillsTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("archivedBillsDesc")}
            </p>
          </div>
        </Link>

        <Link
          href="/dashboard/settings"
          className="group flex items-start gap-4 rounded-xl border border-slate-200 border-l-4 border-l-violet-300 bg-white p-5 shadow-sm transition-all hover:border-l-violet-400 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:border-l-violet-600 dark:hover:bg-slate-700/50"
        >
          <div className="rounded-lg bg-violet-100 p-2.5 text-violet-600 transition-colors group-hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-400">
            <Settings size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {t("settingsTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("settingsDesc")}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
