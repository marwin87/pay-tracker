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
import { Tile } from "@/components/settings/Tile";
import { ProfileTile } from "@/components/settings/ProfileTile";
import { CurrencyTile } from "@/components/settings/CurrencyTile";
import { LanguagesTile } from "@/components/settings/LanguagesTile";
import { EmailNotificationsTile } from "@/components/settings/EmailNotificationsTile";
import { BrowserNotificationsTile } from "@/components/settings/BrowserNotificationsTile";
import { CategoriesTile } from "@/components/settings/CategoriesTile";
import { UnsavedChangesDialog } from "@/components/settings/UnsavedChangesDialog";
import DeleteAccountDialog from "@/components/settings/DeleteAccountDialog";

export default function SettingsPage() {
  const t = useTranslations("SettingsPage");
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [currencyDirty, setCurrencyDirty] = useState(false);
  const [emailDirty, setEmailDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const TABS = ["account", "notifications", "categories", "data"] as const;
  type TabKey = (typeof TABS)[number];
  const [activeTab, setActiveTab] = useState<TabKey>("account");

  const isDirtyAny = profileDirty || currencyDirty || emailDirty;

  const onProfileDirty = useCallback((d: boolean) => setProfileDirty(d), []);
  const onCurrencyDirty = useCallback((d: boolean) => setCurrencyDirty(d), []);
  const onEmailDirty = useCallback((d: boolean) => setEmailDirty(d), []);

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

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div className={`space-y-4 ${activeTab === "account" ? "" : "hidden"}`}>
        <ProfileTile
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onProfileDirty}
          t={t}
        />
        <CurrencyTile
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onCurrencyDirty}
          t={t}
        />
        <LanguagesTile t={t} />

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

      <div className={`space-y-4 ${activeTab === "notifications" ? "" : "hidden"}`}>
        <EmailNotificationsTile
          profile={profile}
          onProfileUpdate={setProfile}
          onDirtyChange={onEmailDirty}
          t={t}
        />

        <BrowserNotificationsTile t={t} />
      </div>

      <div className={`space-y-4 ${activeTab === "categories" ? "" : "hidden"}`}>
        <CategoriesTile t={t} />
      </div>

      <div className={`space-y-4 ${activeTab === "data" ? "" : "hidden"}`}>
        <Tile
          color="blue"
          icon={HardDriveDownload}
          title={t("backup.title")}
          description={t("backup.description")}
          t={t}
        >
          <BackupButton label="Backup" />
        </Tile>

        <Tile
          color="red"
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
