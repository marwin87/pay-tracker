"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}

export default function CategoryCombobox({ value, onChange, suggestions }: Props) {
  return (
    <>
      <input
        list="bill-categories"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Utilities"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
      />
      <datalist id="bill-categories">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
