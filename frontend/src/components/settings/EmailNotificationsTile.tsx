"use client";

import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchServerTime, type UserProfile } from "@/lib/user-api";
import { ChannelScheduleSection } from "./ChannelScheduleSection";
import { Tile } from "./Tile";

export function EmailNotificationsTile({
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

  return (
    <Tile
      color="yellow"
      icon={Mail}
      title={tp("emailNotifications.title")}
      description={tp("emailNotifications.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <ChannelScheduleSection
        channel="email"
        profile={profile}
        onProfileUpdate={onProfileUpdate}
        onDirtyChange={onDirtyChange}
        t={t}
        masterLabel={tp("emailNotifications.masterToggle")}
        noneWarning={tp("emailNotifications.noneWarning")}
      />
      {serverTime && (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          {tp("emailNotifications.serverTimeHint", { time: serverTime })}
        </p>
      )}
    </Tile>
  );
}
