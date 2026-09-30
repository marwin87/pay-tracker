"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UserProfile } from "@/lib/user-api";
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
    </Tile>
  );
}
