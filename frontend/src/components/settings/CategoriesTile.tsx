"use client";

import { useEffect, useState } from "react";
import { Tag, Pencil, Archive as ArchiveIcon, ArchiveRestore, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  unarchiveCategory,
  type Category,
} from "@/lib/categories-api";
import { CATEGORY_COLORS, CATEGORY_COLOR_SWATCH, categoryLabel } from "@/lib/categories";
import { Tile } from "./Tile";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={color}
          className={`h-6 w-6 shrink-0 rounded-full ${CATEGORY_COLOR_SWATCH[color]} ${
            value === color
              ? "ring-2 ring-offset-2 ring-slate-600 dark:ring-slate-300 dark:ring-offset-slate-800"
              : ""
          }`}
        />
      ))}
    </div>
  );
}

export function CategoriesTile({
  t,
  isCollapsed,
  onToggle,
}: {
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tc = useTranslations("SettingsPage");
  const tCategories = useTranslations("Categories");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  function reload() {
    return fetchCategories(true)
      .then((data) => {
        setCategories(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : tc("categories.loadError"));
      });
  }

  useEffect(() => {
    let cancelled = false;
    fetchCategories(true)
      .then((data) => {
        if (!cancelled) {
          setCategories(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tc("categories.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tc]);

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
    setRowError(null);
  }

  function startNew() {
    setEditingId("new");
    setEditName("");
    setEditColor(CATEGORY_COLORS[0]);
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit() {
    if (!editName.trim()) {
      setRowError(tc("categories.nameRequired"));
      return;
    }
    setSaving(true);
    setRowError(null);
    try {
      if (editingId === "new") {
        await createCategory({ name: editName.trim(), color: editColor });
      } else if (editingId !== null) {
        await updateCategory(editingId, { name: editName.trim(), color: editColor });
      }
      setEditingId(null);
      reload();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : tc("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(cat: Category) {
    try {
      await (cat.is_archived ? unarchiveCategory(cat.id) : archiveCategory(cat.id));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("categories.loadError"));
    }
  }

  return (
    <Tile
      color="green"
      icon={Tag}
      title={tc("categories.title")}
      description={tc("categories.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      {loading && (
        <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && (
        <div className="space-y-2">
          {categories
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((cat) =>
              editingId === cat.id ? (
                <div
                  key={cat.id}
                  className="space-y-2 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-900/10"
                >
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={inputClass}
                    maxLength={50}
                  />
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  {rowError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{rowError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex items-center gap-1 rounded-lg border border-green-700 bg-green-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:border-green-800 hover:bg-green-800 disabled:opacity-50"
                    >
                      <Check size={14} />
                      {saving ? tc("saving") : tc("save")}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <X size={14} />
                      {tc("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={cat.id}
                  className={`flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 ${
                    cat.is_archived ? "opacity-50" : ""
                  }`}
                >
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full ${CATEGORY_COLOR_SWATCH[cat.color as (typeof CATEGORY_COLORS)[number]] ?? CATEGORY_COLOR_SWATCH.slate}`}
                  />
                  <span className="flex-1 min-w-0 truncate text-sm text-slate-700 dark:text-slate-200">
                    {categoryLabel(cat, tCategories)}
                  </span>
                  {cat.is_default && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      {tc("categories.defaultBadge")}
                    </span>
                  )}
                  {cat.is_archived && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      {tc("categories.archivedBadge")}
                    </span>
                  )}
                  <button
                    onClick={() => startEdit(cat)}
                    aria-label={tc("categories.edit")}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => toggleArchive(cat)}
                    aria-label={
                      cat.is_archived ? tc("categories.unarchive") : tc("categories.archive")
                    }
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                  >
                    {cat.is_archived ? <ArchiveRestore size={14} /> : <ArchiveIcon size={14} />}
                  </button>
                </div>
              ),
            )}

          {editingId === "new" ? (
            <div className="space-y-2 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-900/10">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={tc("categories.namePlaceholder")}
                className={inputClass}
                maxLength={50}
                autoFocus
              />
              <ColorPicker value={editColor} onChange={setEditColor} />
              {rowError && <p className="text-xs text-red-600 dark:text-red-400">{rowError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg border border-green-700 bg-green-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:border-green-800 hover:bg-green-800 disabled:opacity-50"
                >
                  <Check size={14} />
                  {saving ? tc("saving") : tc("save")}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <X size={14} />
                  {tc("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startNew}
              className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:border-green-400 hover:bg-green-50 hover:text-green-700 dark:border-slate-600 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            >
              {tc("categories.addNew")}
            </button>
          )}
        </div>
      )}
    </Tile>
  );
}
