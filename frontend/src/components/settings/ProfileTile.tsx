"use client";

import { User } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { changeEmail, type UserProfile } from "@/lib/user-api";
import { Tile } from "./Tile";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

const btnSave =
  "rounded-lg border border-emerald-200 bg-white px-4 py-1.5 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300";
const btnCancel =
  "rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200";

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

  const isEmailDirty = emailInput.length > 0 || emailPassword.length > 0;
  const isDirty = isEmailDirty;

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

    </Tile>
  );
}
