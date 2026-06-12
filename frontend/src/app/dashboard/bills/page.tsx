"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  fetchBills,
  createBill,
  updateBill,
  archiveBill,
  type BillTemplateOut,
  type BillTemplateCreate,
  type BillTemplateUpdate,
} from "@/lib/bills-api";
import BillTemplateForm from "@/components/bills/BillTemplateForm";
import BillTemplateRow from "@/components/bills/BillTemplateRow";
import ArchiveConfirmDialog from "@/components/bills/ArchiveConfirmDialog";

export default function BillsPage() {
  const [templates, setTemplates] = useState<BillTemplateOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState<number | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<BillTemplateOut | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBills()
      .then((data) => {
        if (!cancelled) {
          setTemplates(data);
          setLoadError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load bills.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const categorySuggestions = Array.from(
    new Set(templates.map((t) => t.category).filter((c): c is string => c !== null)),
  );

  async function handleCreate(data: BillTemplateCreate) {
    await createBill(data);
    setExpandedId(null);
    setRefreshKey((k) => k + 1);
  }

  async function handleUpdate(id: number, data: BillTemplateUpdate) {
    await updateBill(id, data);
    setExpandedId(null);
    setRefreshKey((k) => k + 1);
  }

  async function handleArchiveConfirm() {
    if (!archiveTarget || archiving) return;
    setArchiving(true);
    try {
      await archiveBill(archiveTarget.id);
      setArchiveTarget(null);
      setRefreshKey((k) => k + 1);
    } finally {
      setArchiving(false);
    }
  }

  function toggleExpand(id: number | "new") {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {archiveTarget && (
        <ArchiveConfirmDialog
          billName={archiveTarget.name}
          onConfirm={handleArchiveConfirm}
          onCancel={() => setArchiveTarget(null)}
          archiving={archiving}
        />
      )}

      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          Your Bills
        </h1>
        <button
          onClick={() => toggleExpand("new")}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
        >
          <Plus size={16} />
          {expandedId === "new" ? "Cancel" : "New Bill"}
        </button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* Inline create form */}
      {expandedId === "new" && (
        <div className="mb-4">
          <BillTemplateForm
            categorySuggestions={categorySuggestions}
            onSave={handleCreate}
            onCancel={() => setExpandedId(null)}
          />
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 && expandedId !== "new" ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-16 text-center">
          <div className="mb-3 rounded-full bg-indigo-100 dark:bg-indigo-900/30 p-4 text-indigo-500">
            <Plus size={28} />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">No bills yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Add your first bill to get started
          </p>
          <button
            onClick={() => toggleExpand("new")}
            className="mt-4 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Add your first bill
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <BillTemplateRow
              key={t.id}
              template={t}
              isExpanded={expandedId === t.id}
              categorySuggestions={categorySuggestions}
              onEditToggle={() => toggleExpand(t.id)}
              onSave={(data) => handleUpdate(t.id, data)}
              onArchive={() => setArchiveTarget(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
