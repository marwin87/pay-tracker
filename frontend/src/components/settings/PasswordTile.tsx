"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { changePassword } from "@/lib/user-api";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { btnSaveClass as btnSave, btnCancelClass as btnCancel } from "@/components/ui/formButtonClasses";
import { Tile } from "./Tile";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-green-600 dark:focus:ring-green-900/40";

export function PasswordTile({
  onDirtyChange,
  t,
  isCollapsed,
  onToggle,
}: {
  onDirtyChange: (dirty: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const tp = useTranslations("SettingsPage");

  const [curPassword, setCurPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  const isDirty = curPassword.length > 0 || newPassword.length > 0;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

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
      icon={KeyRound}
      title={tp("password.title")}
      description={tp("password.description")}
      t={t}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {tp("profile.newPasswordLabel")}
        </label>
        <p className="text-xs text-slate-400 dark:text-slate-500">{tp("profile.passwordHint")}</p>
        <PasswordInput
          value={curPassword}
          onChange={(e) => setCurPassword(e.target.value)}
          placeholder={tp("profile.currentPasswordPlaceholder")}
          className={inputClass}
        />
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={tp("profile.newPasswordPlaceholder")}
          className={inputClass}
        />
        {passwordError && (
          <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
        )}
        {isDirty && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setCurPassword(""); setNewPassword(""); setPasswordError(null); }}
              disabled={isPasswordSaving}
              className={btnCancel}
            >
              {tp("cancel")}
            </button>
            <button onClick={savePassword} disabled={isPasswordSaving} className={btnSave}>
              {isPasswordSaving ? tp("saving") : tp("save")}
            </button>
          </div>
        )}
      </div>
    </Tile>
  );
}
