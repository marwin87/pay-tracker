"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchServerTime } from "@/lib/user-api";

/** Shared note for all server-sent notifications (email, Telegram, summary). */
export function ServerTimeNote() {
  const tp = useTranslations("SettingsPage");
  const [serverTime, setServerTime] = useState<string | null>(null);

  useEffect(() => {
    fetchServerTime()
      .then(({ server_time }) => {
        const formatted = new Intl.DateTimeFormat("en-GB", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
          timeZoneName: "short",
        }).format(new Date(server_time));
        setServerTime(formatted);
      })
      .catch(() => {});
  }, []);

  if (!serverTime) return null;
  return (
    <p className="text-xs text-slate-400 dark:text-slate-500">
      {tp.rich("notificationsServerTimeHint", {
        time: serverTime,
        b: (chunks) => <strong className="font-semibold">{chunks}</strong>,
      })}
    </p>
  );
}
