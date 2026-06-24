"use client";

import { User } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { changeEmail, changePassword, type UserProfile } from "@/lib/user-api";
import { Tile } from "./Tile";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const btnSave =
  "rounded-lg border border-green-700 bg-green-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:border-green-800 hover:bg-green-800 disabled:opacity-50";
const btnCancel =
  "rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

export function ProfileTile({
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

  const [emailInput, setEmailInput] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailSaving, setIsEmailSaving] = useState(false);

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

  return (
    <Tile
      color="blue"
      icon={User}
      title={tp("profile.title")}
      description={tp("profile.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">
        <span className="text-slate-400 dark:text-slate-500">{tp("profile.currentEmailLabel")} </span>
        {profile.email}
      </p>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {tp("profile.emailLabel")}
        </label>
        <p className="text-xs text-slate-400 dark:text-slate-500">{tp("profile.emailHint")}</p>
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

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {tp("profile.newPasswordLabel")}
        </label>
        <p className="text-xs text-slate-400 dark:text-slate-500">{tp("profile.passwordHint")}</p>
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
          <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
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
