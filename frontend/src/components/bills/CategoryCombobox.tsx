"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchCategories, type Category } from "@/lib/categories-api";
import { categoryLabel } from "@/lib/categories";
import Dropdown from "@/components/ui/Dropdown";

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

  const categoryOptions = categories
    .filter((cat) => !cat.is_archived || cat.id === value)
    .sort((a, b) => a.sort_order - b.sort_order);

  const options = [
    { value: "", label: "—" },
    ...categoryOptions.map((cat) => ({
      value: String(cat.id),
      label: categoryLabel(cat, t),
    })),
  ];

  return (
    <Dropdown
      id={id}
      value={value === "" ? "" : String(value)}
      onChange={(v) => onChange(v === "" ? "" : Number(v))}
      options={options}
      scrollable
    />
  );
}
