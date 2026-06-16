"use client";

import { useEffect, useState } from "react";
import { AtSign } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchMe, updateMe } from "@/lib/user-api";

export default function EmailRemindersToggle() {
  const t = useTranslations("EmailRemindersToggle");
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetchMe()
      .then((profile) => setEnabled(profile.email_reminders_enabled))
      .catch(() => {});
  }, []);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    try {
      await updateMe({ email_reminders_enabled: next });
    } catch {
      setEnabled(enabled);
    }
  }

  if (enabled === null) return null;

  return (
    <button
      onClick={toggle}
      aria-label={enabled ? t("disable") : t("enable")}
      aria-pressed={enabled}
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
    >
      <AtSign size={18} className={enabled ? "" : "opacity-40"} />
    </button>
  );
}
