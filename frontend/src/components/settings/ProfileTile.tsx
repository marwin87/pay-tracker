"use client";

import { User } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { changeEmail, type UserProfile } from "@/lib/user-api";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { btnSaveClass as btnSave, btnCancelClass as btnCancel } from "@/components/ui/formButtonClasses";
import { Tile } from "./Tile";
import { useToast } from "@/context/toast-context";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

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
  const showToast = useToast();

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
      showToast(tp("emailChanged"));
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
          maxLength={254}
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder={tp("profile.emailPlaceholder")}
          className={inputClass}
        />
        <PasswordInput
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
            <button
              onClick={() => { setEmailInput(""); setEmailPassword(""); setEmailError(null); }}
              disabled={isEmailSaving}
              className={btnCancel}
            >
              {tp("cancel")}
            </button>
            <button onClick={saveEmail} disabled={isEmailSaving} className={btnSave}>
              {isEmailSaving ? tp("saving") : tp("save")}
            </button>
          </div>
        )}
      </div>

    </Tile>
  );
}
