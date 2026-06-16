"use client";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-checked={checked}
          className="sr-only peer"
        />
        <div className="w-10 h-5 rounded-full bg-slate-300 dark:bg-slate-600 peer-checked:bg-green-600 dark:peer-checked:bg-green-500 transition-colors peer-disabled:opacity-50" />
        <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </div>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 select-none">
        {label}
      </span>
    </label>
  );
}
