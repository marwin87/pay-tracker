"use client";

import Link from "next/link";
import { Receipt, Archive } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
        Welcome to Pay Tracker
      </h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8">
        Manage your household bills in one place.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/bills"
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all dark:bg-slate-800 dark:border-slate-700 dark:hover:border-indigo-500"
        >
          <div className="rounded-xl bg-indigo-100 p-3 text-indigo-600 group-hover:bg-indigo-200 transition-colors dark:bg-indigo-900/40 dark:text-indigo-400">
            <Receipt size={24} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              Manage Bills
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Create, edit, and track your recurring bills
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
              Archived Bills
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              View past bills and payment history
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
