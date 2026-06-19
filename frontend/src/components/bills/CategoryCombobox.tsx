"use client";

import { useTranslations } from "next-intl";
import { CATEGORY_ORDER } from "@/lib/categories";
import type { BillCategory } from "@/lib/bills-api";

interface Props {
  id: string;
  value: BillCategory | "";
  onChange: (v: BillCategory | "") => void;
}

export default function CategoryCombobox({ id, value, onChange }: Props) {
  const t = useTranslations("Categories");
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as BillCategory | "")}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40"
    >
      <option value="">—</option>
      {CATEGORY_ORDER.map((cat) => (
        <option key={cat} value={cat}>
          {t(cat)}
        </option>
      ))}
    </select>
  );
}
