"use client";

import { Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { updateMe, type UserProfile } from "@/lib/user-api";
import { LOCALE_DEFAULT_CURRENCY } from "@/lib/currency";
import CurrencyPicker from "@/components/CurrencyPicker";
import { Tile } from "./Tile";

const selectClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const customInputClass = selectClass + " mt-2";

const btnCancel =
  "rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200";

const btnSave =
  "rounded-lg border border-emerald-200 bg-white px-4 py-1.5 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300";

export function CurrencyTile({
  profile,
  onProfileUpdate,
  onDirtyChange,
  t,
  isCollapsed,
  onToggle,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  onDirtyChange: (dirty: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tp = useTranslations("SettingsPage");
  const locale = useLocale();

  const preselected = profile.default_currency ?? LOCALE_DEFAULT_CURRENCY[locale] ?? "EUR";
  const [currency, setCurrency] = useState(preselected);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDirty = currency !== preselected;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  function cancel() {
    setCurrency(preselected);
    setSaveError(null);
  }

  async function save() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMe({ default_currency: currency || null });
      onProfileUpdate(updated);
    } catch {
      setSaveError(tp("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Tile
      color="purple"
      icon={Coins}
      title={tp("currency.title")}
      description={tp("currency.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <CurrencyPicker
        value={currency}
        onChange={setCurrency}
        ariaLabel={tp("currency.ariaLabel")}
        customOption={tp("currency.customOption")}
        customCurrencyAriaLabel={tp("currency.customCurrencyAriaLabel")}
        customCurrencyPlaceholder={tp("currency.customCurrencyPlaceholder")}
        inputClassName={customInputClass}
      />

      {saveError && (
        <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
      )}

      {isDirty && (
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={isSaving} className={btnSave}>
            {isSaving ? tp("saving") : tp("save")}
          </button>
          <button onClick={cancel} disabled={isSaving} className={btnCancel}>
            {tp("cancel")}
          </button>
        </div>
      )}
    </Tile>
  );
}
