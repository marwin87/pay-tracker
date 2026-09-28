"use client";

import { Hash } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale, type DecimalSeparator } from "@/context/locale-context";
import { formatAmount } from "@/lib/summary";
import { Tile } from "./Tile";

const SEPARATORS: DecimalSeparator[] = [".", ","];

export function DecimalSeparatorTile({
  t,
  isCollapsed,
  onToggle,
}: {
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tp = useTranslations("SettingsPage");
  const { decimalSeparator, setDecimalSeparator } = useLocale();

  return (
    <Tile
      color="purple"
      icon={Hash}
      title={tp("decimalSeparator.title")}
      description={tp("decimalSeparator.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <div className="overflow-hidden rounded-lg border border-slate-200 divide-y divide-slate-200 dark:border-slate-600 dark:divide-slate-700">
        {SEPARATORS.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            <span className="flex items-center gap-3">
              <span className="relative inline-flex h-4 w-4 shrink-0">
                <input
                  type="radio"
                  name="decimal-separator"
                  checked={decimalSeparator === value}
                  onChange={() => setDecimalSeparator(value)}
                  className="peer sr-only"
                />
                <span className="h-4 w-4 rounded-full border border-slate-300 bg-white transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-green-500 peer-focus-visible:ring-offset-1 peer-checked:border-green-700 dark:border-slate-600 dark:bg-slate-700 dark:peer-checked:border-green-600" />
                <span className="pointer-events-none absolute inset-0 m-auto h-2 w-2 rounded-full bg-green-700 opacity-0 transition-opacity peer-checked:opacity-100 dark:bg-green-600" />
              </span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {value === "." ? tp("decimalSeparator.period") : tp("decimalSeparator.comma")}
              </span>
            </span>
            <span className="text-sm tabular-nums text-slate-400 dark:text-slate-500">
              {formatAmount(123, value)}
            </span>
          </label>
        ))}
      </div>
    </Tile>
  );
}
