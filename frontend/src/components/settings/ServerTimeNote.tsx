"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchServerTime } from "@/lib/user-api";

/** Shared note for all server-sent notifications (email, Telegram, summary). */
export function ServerTimeNote({ timeZone }: { timeZone: string }) {
  const tp = useTranslations("SettingsPage");
  const locale = useLocale();
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    // The server's own clock, shown in the profile zone: if this reads wrong, the
    // zone (not the clock) is what needs fixing.
    fetchServerTime()
      .then(({ server_time }) => {
        const formatted = new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone,
        }).format(new Date(server_time));
        setNow(formatted);
      })
      .catch(() => {});
  }, [timeZone, locale]);

  if (!now) return null;
  return (
    // Description tone (not the dimmer "muted hint"): in Vesperfall the muted one is a
    // dark brown on the dark page and all but disappears.
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {tp.rich("notificationsServerTimeHint", {
        zone: timeZone,
        time: now,
        b: (chunks) => (
          <strong className="font-semibold text-slate-700 dark:text-slate-200">{chunks}</strong>
        ),
      })}
    </p>
  );
}
