"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  User,
  Bell,
  BellOff,
  HardDriveDownload,
  HardDriveUpload,
  Mail,
  AlertTriangle,
  Send,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  fetchMe,
  updateMe,
  changePassword,
  changeEmail,
  sendNotificationNow,
  UserProfile,
} from "@/lib/user-api";
import { useNotifications } from "@/hooks/useNotifications";
import BackupButton from "@/components/BackupButton";
import RestoreButton from "@/components/RestoreButton";
import { Switch } from "@/components/ui/Switch";

// ---------------------------------------------------------------------------
// Tile wrapper
// ---------------------------------------------------------------------------

type TileColor = "blue" | "yellow" | "red";

const TILE_STYLES: Record<
  TileColor,
  { border: string; header: string; icon: string }
> = {
  blue: {
    border: "border-blue-400 dark:border-blue-500",
    header: "bg-blue-50 dark:bg-blue-900/30",
    icon: "text-blue-500 dark:text-blue-400",
  },
  yellow: {
    border: "border-yellow-400 dark:border-yellow-500",
    header: "bg-yellow-50 dark:bg-yellow-900/30",
    icon: "text-yellow-600 dark:text-yellow-400",
  },
  red: {
    border: "border-red-400 dark:border-red-500",
    header: "bg-red-50 dark:bg-red-900/30",
    icon: "text-red-500 dark:text-red-400",
  },
};

function Tile({
  color,
  icon: Icon,
  title,
  description,
  children,
  isDirty,
  isSaving,
  saveError,
  onSave,
  onCancel,
  t,
}: {
  color: TileColor;
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  isDirty?: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  onSave?: () => void;
  onCancel?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const s = TILE_STYLES[color];
  return (
    <div
      className={`rounded-xl border-l-4 border border-slate-200 dark:border-slate-700 overflow-hidden ${s.border}`}
    >
      <div className={`px-5 py-4 ${s.header}`}>
        <div className="flex items-center gap-2">
          <Icon size={18} className={s.icon} />
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <div className="px-5 py-4 space-y-4 bg-white dark:bg-slate-800">
        {children}

        {saveError && (
          <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
        )}

        {isDirty && onSave && onCancel && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="rounded-lg px-4 py-1.5 text-sm font-medium bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 transition-colors"
            >
              {isSaving ? t("saving") : t("save")}
            </button>
            <button
              onClick={onCancel}
              disabled={isSaving}
              className="rounded-lg px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              {t("cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile tile
// ---------------------------------------------------------------------------

function ProfileTile({
  profile,
  onProfileUpdate,
  onDirtyChange,
  t,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  onDirtyChange: (dirty: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const tp = useTranslations("SettingsPage");

  // Email change sub-form
  const [emailInput, setEmailInput] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailSaving, setIsEmailSaving] = useState(false);

  // Password change sub-form
  const [curPassword, setCurPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  const isEmailDirty = emailInput.length > 0 || emailPassword.length > 0;
  const isPasswordDirty = curPassword.length > 0 || newPassword.length > 0;
  const isDirty = isEmailDirty || isPasswordDirty;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  async function saveEmail() {
    if (!emailInput || !emailPassword) {
      setEmailError(tp("profile.emailAndPasswordRequired"));
      return;
    }
    setEmailError(null);
    setIsEmailSaving(true);
    try {
      const updated = await changeEmail(emailInput, emailPassword);
      onProfileUpdate(updated);
      setEmailInput("");
      setEmailPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setEmailError(
        msg.includes("already registered")
          ? tp("profile.emailTaken")
          : tp("profile.wrongPassword"),
      );
    } finally {
      setIsEmailSaving(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      setPasswordError(tp("profile.passwordTooShort"));
      return;
    }
    setPasswordError(null);
    setIsPasswordSaving(true);
    try {
      await changePassword(curPassword, newPassword);
      setCurPassword("");
      setNewPassword("");
    } catch {
      setPasswordError(tp("profile.wrongPassword"));
    } finally {
      setIsPasswordSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const btnSave =
    "rounded-lg px-4 py-1.5 text-sm font-medium bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 transition-colors";
  const btnCancel =
    "rounded-lg px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors";

  return (
    <Tile
      color="blue"
      icon={User}
      title={tp("profile.title")}
      description={tp("profile.description")}
      t={t}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {profile.email}
      </p>

      {/* Email change */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {tp("profile.emailLabel")}
        </label>
        <input
          type="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder={tp("profile.emailPlaceholder")}
          className={inputClass}
        />
        <input
          type="password"
          value={emailPassword}
          onChange={(e) => setEmailPassword(e.target.value)}
          placeholder={tp("profile.currentPasswordPlaceholder")}
          className={inputClass}
        />
        {emailError && (
          <p className="text-sm text-red-600 dark:text-red-400">{emailError}</p>
        )}
        {isEmailDirty && (
          <div className="flex gap-2 pt-1">
            <button onClick={saveEmail} disabled={isEmailSaving} className={btnSave}>
              {isEmailSaving ? tp("saving") : tp("save")}
            </button>
            <button
              onClick={() => { setEmailInput(""); setEmailPassword(""); setEmailError(null); }}
              disabled={isEmailSaving}
              className={btnCancel}
            >
              {tp("cancel")}
            </button>
          </div>
        )}
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />

      {/* Password change */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {tp("profile.newPasswordLabel")}
        </label>
        <input
          type="password"
          value={curPassword}
          onChange={(e) => setCurPassword(e.target.value)}
          placeholder={tp("profile.currentPasswordPlaceholder")}
          className={inputClass}
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={tp("profile.newPasswordPlaceholder")}
          className={inputClass}
        />
        {passwordError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {passwordError}
          </p>
        )}
        {isPasswordDirty && (
          <div className="flex gap-2 pt-1">
            <button onClick={savePassword} disabled={isPasswordSaving} className={btnSave}>
              {isPasswordSaving ? tp("saving") : tp("save")}
            </button>
            <button
              onClick={() => { setCurPassword(""); setNewPassword(""); setPasswordError(null); }}
              disabled={isPasswordSaving}
              className={btnCancel}
            >
              {tp("cancel")}
            </button>
          </div>
        )}
      </div>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Email notifications tile
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => i);
function fmtHour(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

function EmailNotificationsTile({
  profile,
  onProfileUpdate,
  onDirtyChange,
  t,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  onDirtyChange: (dirty: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const tp = useTranslations("SettingsPage");

  const [emailEnabled, setEmailEnabled] = useState(profile.email_reminders_enabled);
  const [notify2, setNotify2] = useState(profile.notify_2_days_before);
  const [notify1, setNotify1] = useState(profile.notify_1_day_before);
  const [notifyOn, setNotifyOn] = useState(profile.notify_on_day);
  const [notify1After, setNotify1After] = useState(profile.notify_1_day_after);
  const [sendHour, setSendHour] = useState(profile.reminder_send_hour);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [sendNowResult, setSendNowResult] = useState<
    { sent: number } | { error: string } | null
  >(null);

  const isDirty =
    emailEnabled !== profile.email_reminders_enabled ||
    notify2 !== profile.notify_2_days_before ||
    notify1 !== profile.notify_1_day_before ||
    notifyOn !== profile.notify_on_day ||
    notify1After !== profile.notify_1_day_after ||
    sendHour !== profile.reminder_send_hour;

  const noneSelected = !notify2 && !notify1 && !notifyOn && !notify1After;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  function cancel() {
    setEmailEnabled(profile.email_reminders_enabled);
    setNotify2(profile.notify_2_days_before);
    setNotify1(profile.notify_1_day_before);
    setNotifyOn(profile.notify_on_day);
    setNotify1After(profile.notify_1_day_after);
    setSendHour(profile.reminder_send_hour);
    setSaveError(null);
  }

  async function save() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMe({
        email_reminders_enabled: emailEnabled,
        notify_2_days_before: notify2,
        notify_1_day_before: notify1,
        notify_on_day: notifyOn,
        notify_1_day_after: notify1After,
        reminder_send_hour: sendHour,
      });
      onProfileUpdate(updated);
    } catch {
      setSaveError(tp("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendNow() {
    setIsSendingNow(true);
    setSendNowResult(null);
    try {
      const result = await sendNotificationNow();
      setSendNowResult(result);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : tp("saveFailed");
      setSendNowResult({ error: msg });
    } finally {
      setIsSendingNow(false);
    }
  }

  const checkboxClass =
    "h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600";
  const labelClass =
    "ml-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer";

  const checkboxes: [boolean, (v: boolean) => void, string][] = [
    [notify2, setNotify2, tp("emailNotifications.twoDaysBefore")],
    [notify1, setNotify1, tp("emailNotifications.oneDayBefore")],
    [notifyOn, setNotifyOn, tp("emailNotifications.onDay")],
    [notify1After, setNotify1After, tp("emailNotifications.oneDayAfter")],
  ];

  return (
    <Tile
      color="yellow"
      icon={Mail}
      title={tp("emailNotifications.title")}
      description={tp("emailNotifications.description")}
      isDirty={isDirty}
      isSaving={isSaving}
      saveError={saveError}
      onSave={save}
      onCancel={cancel}
      t={t}
    >
      <Switch
        checked={emailEnabled}
        onChange={setEmailEnabled}
        label={tp("emailNotifications.masterToggle")}
      />

      <div className={!emailEnabled ? "opacity-50 pointer-events-none" : ""}>
        <div className="space-y-2">
          {checkboxes.map(([checked, setter, label]) => (
            <label key={label} className="flex items-center">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setter(e.target.checked)}
                className={checkboxClass}
              />
              <span className={labelClass}>{label}</span>
            </label>
          ))}
        </div>

        {noneSelected && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 px-3 py-2 mt-2">
            <AlertTriangle
              size={15}
              className="text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0"
            />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              {tp("emailNotifications.noneWarning")}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
            {tp("emailNotifications.sendTimeLabel")}
          </label>
          <select
            value={sendHour}
            onChange={(e) => setSendHour(Number(e.target.value))}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={handleSendNow}
          disabled={
            isSendingNow || !emailEnabled || isDirty
          }
          className="flex items-center gap-2 self-start rounded-lg px-4 py-1.5 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isSendingNow ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {isSendingNow
            ? tp("emailNotifications.sendNowSending")
            : tp("emailNotifications.sendNowButton")}
        </button>

        {sendNowResult && "error" in sendNowResult && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {sendNowResult.error}
          </p>
        )}
        {sendNowResult && "sent" in sendNowResult && (
          <p className="text-sm text-green-600 dark:text-green-500">
            {sendNowResult.sent === 0
              ? tp("emailNotifications.sendNowNoReminders")
              : tp("emailNotifications.sendNowSent", {
                  count: sendNowResult.sent,
                })}
          </p>
        )}
        </div>
      </div>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Browser notifications tile
// ---------------------------------------------------------------------------

function BrowserNotificationsTile({
  t,
}: {
  t: ReturnType<typeof useTranslations>;
}) {
  const tp = useTranslations("SettingsPage");
  const { permission, isEnabled, requestPermission, setEnabled } = useNotifications();

  return (
    <Tile
      color="yellow"
      icon={Bell}
      title={tp("browserNotifications.title")}
      description={tp("browserNotifications.description")}
      t={t}
    >
      {permission === "denied" ? (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-3 py-2">
          <BellOff
            size={15}
            className="text-red-600 dark:text-red-400 mt-0.5 shrink-0"
          />
          <p className="text-sm text-red-700 dark:text-red-300">
            {tp("browserNotifications.blockedWarning")}
          </p>
        </div>
      ) : permission === "granted" ? (
        <div className="flex flex-col gap-2">
          <Switch
            checked={isEnabled}
            onChange={setEnabled}
            label={tp("browserNotifications.toggle")}
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {tp("browserNotifications.osHint")}
          </p>
        </div>
      ) : (
        <button
          onClick={requestPermission}
          className="rounded-lg px-4 py-1.5 text-sm font-medium bg-green-700 text-white hover:bg-green-800 transition-colors"
        >
          {tp("browserNotifications.enable")}
        </button>
      )}
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Unsaved changes dialog
// ---------------------------------------------------------------------------

function UnsavedChangesDialog({
  onLeave,
  onStay,
  t,
}: {
  onLeave: () => void;
  onStay: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onStay}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl bg-white dark:bg-slate-800 shadow-xl p-6">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">
          {t("unsavedTitle")}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          {t("unsavedDescription")}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onStay}
            className="rounded-lg px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            {t("unsavedStay")}
          </button>
          <button
            onClick={onLeave}
            className="rounded-lg px-4 py-1.5 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            {t("unsavedLeave")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const t = useTranslations("SettingsPage");
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [emailDirty, setEmailDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const isDirtyAny = profileDirty || emailDirty;
  const isDirtyRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = isDirtyAny;
  }, [isDirtyAny]);

  const onProfileDirty = useCallback((d: boolean) => setProfileDirty(d), []);
  const onEmailDirty = useCallback((d: boolean) => setEmailDirty(d), []);

  useEffect(() => {
    fetchMe().then(setProfile).catch(() => {});
  }, []);

  // Browser tab close / refresh guard
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirtyRef.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // In-app navigation guard: capture all anchor clicks at document level
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!isDirtyRef.current) return;
      const anchor = (e.target as Element).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("mailto:")
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  function confirmLeave() {
    if (pendingHref) {
      setPendingHref(null);
      router.push(pendingHref);
    }
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        {t("pageTitle")}
      </h1>

      <ProfileTile
        profile={profile}
        onProfileUpdate={setProfile}
        onDirtyChange={onProfileDirty}
        t={t}
      />

      <EmailNotificationsTile
        profile={profile}
        onProfileUpdate={setProfile}
        onDirtyChange={onEmailDirty}
        t={t}
      />

      <BrowserNotificationsTile t={t} />

      <Tile
        color="red"
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
      </Tile>

      {pendingHref && (
        <UnsavedChangesDialog
          onLeave={confirmLeave}
          onStay={() => setPendingHref(null)}
          t={t}
        />
      )}
    </div>
  );
}
