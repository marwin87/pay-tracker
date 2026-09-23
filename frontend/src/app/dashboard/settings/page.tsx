"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDriveDownload, HardDriveUpload, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { deleteAccount, fetchMe, UserProfile } from "@/lib/user-api";
import { notifyAuthChange } from "@/lib/auth-store";
import BackupButton from "@/components/BackupButton";
import RestoreButton from "@/components/RestoreButton";
import SnapshotRecoverySection from "@/components/SnapshotRecoverySection";
import { Tile, TILE_STYLES, type TileColor } from "@/components/settings/Tile";
import { ProfileTile } from "@/components/settings/ProfileTile";
import { PasswordTile } from "@/components/settings/PasswordTile";
import { CurrencyTile } from "@/components/settings/CurrencyTile";
import { LanguagesTile } from "@/components/settings/LanguagesTile";
import { EmailNotificationsTile } from "@/components/settings/EmailNotificationsTile";
import { TelegramNotificationsTile } from "@/components/settings/TelegramNotificationsTile";
import { BrowserNotificationsTile } from "@/components/settings/BrowserNotificationsTile";
import { CategoriesTile } from "@/components/settings/CategoriesTile";
import { UnsavedChangesDialog } from "@/components/settings/UnsavedChangesDialog";
import DeleteAccountDialog from "@/components/settings/DeleteAccountDialog";

const TABS = ["account", "preferences", "notifications", "categories", "data"] as const;
type TabKey = (typeof TABS)[number];

// One color per tab; tiles inside a tab and the active-tab underline all use it.
const TAB_COLOR: Record<TabKey, TileColor> = {
  account: "blue",
  preferences: "purple",
  notifications: "yellow",
  categories: "green",
  data: "orange",
};

function tabFromUrl(): TabKey {
  if (typeof window === "undefined") return "account";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return TABS.find((k) => k === tab) ?? "account";
}

export default function SettingsPage() {
  const t = useTranslations("SettingsPage");
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [currencyDirty, setCurrencyDirty] = useState(false);
  const [emailDirty, setEmailDirty] = useState(false);
  const [telegramDirty, setTelegramDirty] = useState(false);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Safe to read the URL in the initializer: nothing tab-related renders until the profile loads.
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl);

  const isDirtyAny =
    profileDirty || currencyDirty || emailDirty || telegramDirty || passwordDirty;

  const onProfileDirty = useCallback((d: boolean) => setProfileDirty(d), []);
  const onCurrencyDirty = useCallback((d: boolean) => setCurrencyDirty(d), []);
  const onEmailDirty = useCallback((d: boolean) => setEmailDirty(d), []);
  const onTelegramDirty = useCallback((d: boolean) => setTelegramDirty(d), []);
  const onPasswordDirty = useCallback((d: boolean) => setPasswordDirty(d), []);

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `?tab=${tab}`);
  }

  useEffect(() => {
    fetchMe().then(setProfile).catch(() => {});
  }, []);

  // Browser tab close / refresh guard
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirtyAny) e.preventDefault();
    },
    [isDirtyAny],
  );
  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [handleBeforeUnload]);

  // In-app navigation guard: capture all anchor clicks at document level
  const handleNavClick = useCallback(
    (e: MouseEvent) => {
      if (!isDirtyAny) return;
      const anchor = (e.target as Element).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:"))
        return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    },
    [isDirtyAny],
  );
  useEffect(() => {
    document.addEventListener("click", handleNavClick, true);
    return () => document.removeEventListener("click", handleNavClick, true);
  }, [handleNavClick]);

  function confirmLeave() {
    if (pendingHref) {
      setPendingHref(null);
      router.push(pendingHref);
    }
  }

  async function handleDeleteConfirm() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      setDeleteDialogOpen(false);
      notifyAuthChange();
      router.refresh();
      router.push("/login");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("deleteAccount.error"));
      setDeleting(false);
    }
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
        {t("pageTitle")}
      </h1>

      <div
        role="tablist"
        className="flex gap-1 border-b border-slate-200 dark:border-slate-700"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            id={`settings-tab-${tab}`}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`settings-panel-${tab}`}
            onClick={() => selectTab(tab)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? TILE_STYLES[TAB_COLOR[tab]].tab
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="settings-panel-account"
        aria-labelledby="settings-tab-account"
        className={`space-y-4 ${activeTab === "account" ? "" : "hidden"}`}
      >
        <ProfileTile
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onProfileDirty}
          t={t}
        />
        <PasswordTile onDirtyChange={onPasswordDirty} t={t} />

        <Tile
          color="red"
          icon={Trash2}
          title={t("deleteAccount.title")}
          description={t("deleteAccount.description")}
          t={t}
        >
          <button
            onClick={() => setDeleteDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <Trash2 size={18} />
            <span>{t("deleteAccount.button")}</span>
          </button>
        </Tile>
      </div>

      <div
        role="tabpanel"
        id="settings-panel-preferences"
        aria-labelledby="settings-tab-preferences"
        className={`space-y-4 ${activeTab === "preferences" ? "" : "hidden"}`}
      >
        <CurrencyTile
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onCurrencyDirty}
          t={t}
        />
        <LanguagesTile t={t} />
      </div>

      <div
        role="tabpanel"
        id="settings-panel-notifications"
        aria-labelledby="settings-tab-notifications"
        className={`space-y-4 ${activeTab === "notifications" ? "" : "hidden"}`}
      >
        <EmailNotificationsTile
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onEmailDirty}
          t={t}
        />

        <TelegramNotificationsTile
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onTelegramDirty}
          t={t}
        />

        <BrowserNotificationsTile profile={profile} t={t} />
      </div>

      <div
        role="tabpanel"
        id="settings-panel-categories"
        aria-labelledby="settings-tab-categories"
        className={`space-y-4 ${activeTab === "categories" ? "" : "hidden"}`}
      >
        <CategoriesTile t={t} />
      </div>

      <div
        role="tabpanel"
        id="settings-panel-data"
        aria-labelledby="settings-tab-data"
        className={`space-y-4 ${activeTab === "data" ? "" : "hidden"}`}
      >
        <Tile
          color={TAB_COLOR.data}
          icon={HardDriveDownload}
          title={t("backup.title")}
          description={t("backup.description")}
          t={t}
        >
          <BackupButton label="Backup" />
        </Tile>

        <Tile
          color={TAB_COLOR.data}
          icon={HardDriveUpload}
          title={t("restore.title")}
          description={t("restore.description")}
          t={t}
        >
          <RestoreButton label="Restore" />
          <SnapshotRecoverySection />
        </Tile>
      </div>

      {pendingHref && (
        <UnsavedChangesDialog
          onLeave={confirmLeave}
          onStay={() => setPendingHref(null)}
          t={t}
        />
      )}

      {deleteDialogOpen && (
        <DeleteAccountDialog
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteDialogOpen(false)}
          deleting={deleting}
          error={deleteError}
        />
      )}
    </div>
  );
}
