"use client";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  ariaLabel: string;
}

export default function FilterSelect({ value, onChange, options, ariaLabel }: Props) {
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-7 py-1.5 text-xs font-medium text-slate-600 shadow-sm outline-none transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:focus:border-green-600 dark:focus:ring-green-900/40 cursor-pointer"
      >
        {options.map(({ value: v, label }) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}
