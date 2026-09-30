"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { updateMe, type UserProfile } from "@/lib/user-api";
import { Switch } from "@/components/ui/Switch";
import { Tile } from "./Tile";

export function ShareSettingsTile({
  profile,
  onProfileUpdate,
  t,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const tp = useTranslations("SettingsPage");
  const tc = useTranslations("Common");
  const [enabled, setEnabled] = useState(profile.share_enabled);
  const [busy, setBusy] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch<{ configured: boolean }>("/auth/smtp-status")
      .then((d) => setSmtpConfigured(d?.configured ?? false))
      .catch(() => setSmtpConfigured(false));
  }, []);

  async function toggle(value: boolean) {
    setEnabled(value);
    setBusy(true);
    try {
      onProfileUpdate(await updateMe({ share_enabled: value }));
    } catch {
      setEnabled(!value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tile
      color="teal"
      icon={Share2}
      title={tp("shareByEmail.title")}
      description={tp("shareByEmail.description")}
      t={t}
    >
      <Switch
        checked={enabled}
        onChange={toggle}
        label={tp("shareByEmail.toggleLabel")}
        disabled={busy || smtpConfigured === false}
      />
      {smtpConfigured === false && (
        <p className="text-sm text-slate-400 dark:text-slate-500">{tc("smtpNotConfigured")}</p>
      )}
    </Tile>
  );
}
