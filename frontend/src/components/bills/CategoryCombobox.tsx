"use client";

import { useTranslations } from "next-intl";

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}

export default function CategoryCombobox({ id, value, onChange, suggestions }: Props) {
  const t = useTranslations("CategoryCombobox");
  const listId = `${id}-list`;
  return (
    <>
      <input
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("placeholder")}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
