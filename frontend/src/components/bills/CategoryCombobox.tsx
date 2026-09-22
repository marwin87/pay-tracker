"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchCategories, type Category } from "@/lib/categories-api";
import { categoryLabel } from "@/lib/categories";

interface Props {
  id: string;
  value: number | "";
  onChange: (v: number | "") => void;
}

export default function CategoryCombobox({ id, value, onChange }: Props) {
  const t = useTranslations("Categories");
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Fetch archived categories too — an archived category can still be the
    // bill's current value and must stay visible in that case, just not
    // offered for newly-picked bills (filtered out below unless selected).
    fetchCategories(true)
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        /* combobox stays empty; form validation still requires a pick */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = categories
    .filter((cat) => !cat.is_archived || cat.id === value)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40"
    >
      <option value="">—</option>
      {options.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {categoryLabel(cat, t)}
        </option>
      ))}
    </select>
  );
}
