"use client";

import { useEffect } from "react";
import { Bell, BellRing, BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useNotifications } from "@/hooks/useNotifications";

export default function NotificationToggle() {
  const t = useTranslations("NotificationToggle");
  const { permission, requestPermission, notifyDueToday } = useNotifications();

  useEffect(() => {
    // Fire-and-forget on mount only: check if any bills are due today.
    // Empty deps is intentional — this should run exactly once per mount.
    if (permission === "granted") notifyDueToday();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleClick() {
    if (permission === "default") {
      await requestPermission();
    }
    await notifyDueToday();
  }

  if (permission === "denied") {
    return (
      <button
        disabled
        suppressHydrationWarning
        aria-label={t("blocked")}
        className="rounded-lg p-2 text-slate-300 dark:text-slate-600 transition-colors cursor-not-allowed"
      >
        <BellOff size={18} />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      suppressHydrationWarning
      aria-label={permission === "granted" ? t("enabled") : t("enable")}
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
    >
      {permission === "granted" ? <BellRing size={18} /> : <Bell size={18} />}
    </button>
  );
}
