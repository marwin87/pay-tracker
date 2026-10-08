"use client";

import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export default function SearchInput({ value, onChange, placeholder }: Props) {
  return (
    <div className="relative flex w-full items-center sm:w-56">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 text-slate-400 dark:text-slate-500"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full [&::-webkit-search-cancel-button]:cursor-pointer rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-slate-600 shadow-sm outline-none transition-all placeholder:text-slate-400 hover:border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:placeholder:text-slate-500 dark:hover:border-emerald-700 dark:focus:border-green-600 dark:focus:ring-green-900/40"
      />
    </div>
  );
}
