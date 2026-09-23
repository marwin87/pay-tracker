"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

// One color per Settings tab: every tile in a tab shares it, and the tab underline reuses it.
// Exception: red is reserved for the Delete Account tile (destructive), never a tab color.
export type TileColor = "blue" | "purple" | "yellow" | "green" | "orange" | "red";

export const TILE_STYLES: Record<
  TileColor,
  { border: string; header: string; icon: string; tab: string }
> = {
  blue: {
    border: "border-blue-400 dark:border-blue-500",
    header: "bg-blue-50 dark:bg-blue-900/30",
    icon: "text-blue-500 dark:text-blue-400",
    tab: "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400",
  },
  purple: {
    border: "border-purple-400 dark:border-purple-500",
    header: "bg-purple-50 dark:bg-purple-900/30",
    icon: "text-purple-500 dark:text-purple-400",
    tab: "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400",
  },
  yellow: {
    border: "border-yellow-400 dark:border-yellow-500",
    header: "bg-yellow-50 dark:bg-yellow-900/30",
    icon: "text-yellow-600 dark:text-yellow-400",
    tab: "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400",
  },
  green: {
    border: "border-green-400 dark:border-emerald-500",
    header: "bg-green-50 dark:bg-emerald-900/30",
    icon: "text-green-600 dark:text-emerald-400",
    tab: "border-green-600 text-green-600 dark:border-emerald-400 dark:text-emerald-400",
  },
  orange: {
    border: "border-orange-400 dark:border-orange-500",
    header: "bg-orange-50 dark:bg-orange-900/30",
    icon: "text-orange-500 dark:text-orange-400",
    tab: "border-orange-500 text-orange-600 dark:border-orange-400 dark:text-orange-400",
  },
  red: {
    border: "border-red-400 dark:border-red-500",
    header: "bg-red-50 dark:bg-red-900/30",
    icon: "text-red-500 dark:text-red-400",
    tab: "border-red-600 text-red-600 dark:border-red-400 dark:text-red-400",
  },
};

export function Tile({
  color,
  icon: Icon,
  title,
  description,
  children,
  isDirty,
  isSaving,
  saveError,
  onSave,
  onCancel,
  isCollapsed,
  onToggle,
  t,
}: {
  color: TileColor;
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  isDirty?: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  onSave?: () => void;
  onCancel?: () => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const s = TILE_STYLES[color];
  return (
    <div
      className={`rounded-xl border-l-4 border ${s.border}`}
    >
      <button
        onClick={onToggle}
        className={`w-full text-left px-5 py-4 ${isCollapsed ? "rounded-xl" : "rounded-t-xl"} ${s.header} ${onToggle ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center gap-2">
          <Icon size={18} className={s.icon} />
          <h2 className="flex-1 font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </h2>
          {onToggle && (
            <ChevronRight
              size={14}
              className={`shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-150 ${
                isCollapsed ? "" : "rotate-90"
              }`}
            />
          )}
        </div>
        {!isCollapsed && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </button>

      {!isCollapsed && (
        <div className="rounded-b-xl px-5 py-4 space-y-4 bg-white dark:bg-slate-800">
          {children}

          {saveError && (
            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
          )}

          {isDirty && onSave && onCancel && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={onSave}
                disabled={isSaving}
                className="rounded-lg border border-green-700 bg-green-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:border-green-800 hover:bg-green-800 disabled:opacity-50"
              >
                {isSaving ? t("saving") : t("save")}
              </button>
              <button
                onClick={onCancel}
                disabled={isSaving}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {t("cancel")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
