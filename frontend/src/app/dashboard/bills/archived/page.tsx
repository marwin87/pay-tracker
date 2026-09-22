"use client";

import { useEffect, useState } from "react";
import { Archive, ChevronRight, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchBills, type BillTemplateOut } from "@/lib/bills-api";
import { categoryLabel, distinctCategories } from "@/lib/categories";
import { SessionExpiredError } from "@/lib/api";
import FilterSelect from "@/components/FilterSelect";
import { useCollapsedCategories } from "@/hooks/useCollapsedCategories";

export default function ArchivedBillsPage() {
  const t = useTranslations("ArchivedBillsPage");
  const tCategories = useTranslations("Categories");
  const tFilters = useTranslations("Filters");
  const [templates, setTemplates] = useState<BillTemplateOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredTemplates =
    categoryFilter === "all"
      ? templates
      : templates.filter((tmpl) => String(tmpl.category.id) === categoryFilter);

  const categoryOptions = [
    { value: "all", label: tFilters("allCategories") },
    ...distinctCategories(templates, (tmpl) => tmpl.category).map((cat) => ({
      value: String(cat.id),
      label: categoryLabel(cat, tCategories),
    })),
  ];

  const activeCategories = distinctCategories(filteredTemplates, (tmpl) => tmpl.category);
  const activeCategoryKeys = activeCategories.map((cat) => String(cat.id));

  const { collapsed, toggle, collapseAll, expandAll, allCollapsed } =
    useCollapsedCategories("archived-bills-collapsed-categories", activeCategoryKeys);

  useEffect(() => {
    let cancelled = false;
    fetchBills(true)
      .then((data) => {
        if (!cancelled) {
          setTemplates(data.filter((t) => t.is_archived));
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError) return;
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t("loadError"));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("subtitle")}
        </p>
        {templates.length > 0 && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <FilterSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryOptions}
              ariaLabel={tFilters("allCategories")}
            />
            <button
              onClick={allCollapsed ? expandAll : collapseAll}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
            >
              <ChevronsUpDown size={13} />
              {allCollapsed ? t("expandAll") : t("collapseAll")}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse"
            />
          ))}
        </div>
      )}

      {loadError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {loadError}
        </div>
      )}

      {!loading && !loadError && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <div className="mb-3 rounded-full bg-slate-100 dark:bg-slate-700 p-4 text-slate-400">
            <Archive size={28} />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">{t("noArchivedBills")}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("willAppearHere")}
          </p>
        </div>
      )}

      {!loading && !loadError && templates.length > 0 && filteredTemplates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <p className="font-medium text-slate-700 dark:text-slate-300">{t("noFilterResults")}</p>
        </div>
      )}

      {!loading && filteredTemplates.length > 0 && (
        <div className="flex flex-col gap-6">
          {activeCategories.map((cat) => {
            const key = String(cat.id);
            const group = filteredTemplates
              .filter((tmpl) => tmpl.category.id === cat.id)
              .sort((a, b) => a.name.localeCompare(b.name));
            return (
              <div key={key}>
                <button
                  onClick={() => toggle(key)}
                  className="mb-3 flex w-full items-center gap-2.5 text-left"
                >
                  <ChevronRight
                    size={12}
                    className={`shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-150 ${
                      collapsed.has(key) ? "" : "rotate-90"
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
                    {categoryLabel(cat, tCategories)}
                  </span>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-xs font-semibold text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                    {group.length}
                  </span>
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700/60" />
                </button>
                {!collapsed.has(key) && <div className="flex flex-col gap-2">
                  {group.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 opacity-70 dark:bg-slate-800 dark:border-slate-700"
                    >
                      <div className="flex flex-1 flex-col min-w-0 gap-0.5">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
                          {tmpl.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {tmpl.amount} {tmpl.currency}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            {t(`frequency.${tmpl.frequency}` as never) ?? tmpl.frequency}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        {t("archived")}
                      </span>
                    </div>
                  ))}
                </div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
