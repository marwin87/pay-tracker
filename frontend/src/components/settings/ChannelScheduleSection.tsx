"use client";

import { AlertTriangle, BarChart2, Loader2, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  sendMonthlySummaryNow,
  sendNotificationNow,
  updateMe,
  type UserProfile,
} from "@/lib/user-api";
import { Switch } from "@/components/ui/Switch";
import { Checkbox } from "@/components/ui/Checkbox";
import Dropdown from "@/components/ui/Dropdown";

export type Channel = "email" | "telegram";

// Which UserProfile fields hold this channel's own schedule.
type Keys = {
  enabled: keyof UserProfile;
  n2: keyof UserProfile;
  n1: keyof UserProfile;
  on: keyof UserProfile;
  after: keyof UserProfile;
  minute: keyof UserProfile;
  summary: keyof UserProfile;
};

const CHANNEL_KEYS: Record<Channel, Keys> = {
  email: {
    enabled: "email_reminders_enabled",
    n2: "notify_2_days_before",
    n1: "notify_1_day_before",
    on: "notify_on_day",
    after: "notify_1_day_after",
    minute: "reminder_send_minute",
    summary: "monthly_summary_enabled",
  },
  telegram: {
    enabled: "telegram_reminders_enabled",
    n2: "telegram_notify_2_days_before",
    n1: "telegram_notify_1_day_before",
    on: "telegram_notify_on_day",
    after: "telegram_notify_1_day_after",
    minute: "telegram_send_minute",
    summary: "telegram_monthly_summary_enabled",
  },
};

const SLOTS = Array.from({ length: 48 }, (_, i) => i * 30);
function fmtSlot(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The schedule controls shared by the Email and Telegram tiles: master toggle,
 * timing windows, send time, monthly summary, and the two "send now" buttons.
 * Each channel reads and writes its own profile fields.
 */
export function ChannelScheduleSection({
  channel,
  profile,
  onProfileUpdate,
  onDirtyChange,
  t,
  masterLabel,
  noneWarning,
  disabledHint,
}: {
  channel: Channel;
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
  onDirtyChange: (dirty: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  masterLabel: string;
  noneWarning: string;
  // Shown instead of the send-now buttons while the channel cannot deliver yet.
  disabledHint?: string;
}) {
  const tp = useTranslations("SettingsPage");
  const k = CHANNEL_KEYS[channel];
  const b = (key: keyof UserProfile) => profile[key] as boolean;

  const [enabled, setEnabled] = useState(b(k.enabled));
  const [notify2, setNotify2] = useState(b(k.n2));
  const [notify1, setNotify1] = useState(b(k.n1));
  const [notifyOn, setNotifyOn] = useState(b(k.on));
  const [notify1After, setNotify1After] = useState(b(k.after));
  const [sendMinute, setSendMinute] = useState(profile[k.minute] as number);
  const [monthlySummary, setMonthlySummary] = useState(b(k.summary));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [isTogglingSummary, setIsTogglingSummary] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [sendNowResult, setSendNowResult] = useState<
    { sent: number } | { error: string } | null
  >(null);
  const [isSendingSummary, setIsSendingSummary] = useState(false);
  const [sendSummaryResult, setSendSummaryResult] = useState<
    { sent: boolean } | { error: string } | null
  >(null);

  const isDirty =
    notify2 !== b(k.n2) ||
    notify1 !== b(k.n1) ||
    notifyOn !== b(k.on) ||
    notify1After !== b(k.after) ||
    sendMinute !== (profile[k.minute] as number);
  const noneSelected = !notify2 && !notify1 && !notifyOn && !notify1After;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  async function toggleEnabled(value: boolean) {
    setEnabled(value);
    setIsTogglingEnabled(true);
    try {
      onProfileUpdate(await updateMe({ [k.enabled]: value }));
    } catch {
      setEnabled(!value);
    } finally {
      setIsTogglingEnabled(false);
    }
  }

  async function toggleSummary(value: boolean) {
    setMonthlySummary(value);
    setIsTogglingSummary(true);
    try {
      onProfileUpdate(await updateMe({ [k.summary]: value }));
    } catch {
      setMonthlySummary(!value);
    } finally {
      setIsTogglingSummary(false);
    }
  }

  function cancel() {
    setNotify2(b(k.n2));
    setNotify1(b(k.n1));
    setNotifyOn(b(k.on));
    setNotify1After(b(k.after));
    setSendMinute(profile[k.minute] as number);
    setSaveError(null);
  }

  async function save() {
    setIsSaving(true);
    setSaveError(null);
    try {
      onProfileUpdate(
        await updateMe({
          [k.n2]: notify2,
          [k.n1]: notify1,
          [k.on]: notifyOn,
          [k.after]: notify1After,
          [k.minute]: sendMinute,
        }),
      );
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
      setSendNowResult(await sendNotificationNow(channel));
    } catch (err) {
      setSendNowResult({ error: err instanceof Error ? err.message : tp("saveFailed") });
    } finally {
      setIsSendingNow(false);
    }
  }

  async function handleSendSummary() {
    setIsSendingSummary(true);
    setSendSummaryResult(null);
    try {
      setSendSummaryResult(await sendMonthlySummaryNow(channel));
    } catch (err) {
      setSendSummaryResult({ error: err instanceof Error ? err.message : tp("saveFailed") });
    } finally {
      setIsSendingSummary(false);
    }
  }

  const checkboxes: [string, boolean, (v: boolean) => void, string][] = [
    ["2-before", notify2, setNotify2, tp("emailNotifications.twoDaysBefore")],
    ["1-before", notify1, setNotify1, tp("emailNotifications.oneDayBefore")],
    ["on-day", notifyOn, setNotifyOn, tp("emailNotifications.onDay")],
    ["1-after", notify1After, setNotify1After, tp("emailNotifications.oneDayAfter")],
  ];
  const buttonClass =
    "flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400";

  return (
    <>
      <Switch
        checked={enabled}
        onChange={toggleEnabled}
        label={masterLabel}
        disabled={isTogglingEnabled}
      />

      <div className={!enabled ? "opacity-50 pointer-events-none" : ""}>
        <div className="space-y-2">
          {checkboxes.map(([key, checked, setter, label]) => (
            <Checkbox key={key} checked={checked} onChange={setter} label={label} />
          ))}
        </div>

        {noneSelected && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 px-3 py-2 mt-2">
            <AlertTriangle size={15} className="text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">{noneWarning}</p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
            {tp("emailNotifications.sendTimeLabel")}
          </label>
          <Dropdown
            variant="pill"
            value={String(sendMinute)}
            onChange={(v) => setSendMinute(Number(v))}
            options={SLOTS.map((h) => ({ value: String(h), label: fmtSlot(h) }))}
            ariaLabel={tp("emailNotifications.sendTimeLabel")}
            scrollable
          />
        </div>

        {isDirty && (
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={isSaving}
                className="rounded-lg border border-emerald-200 bg-white px-4 py-1.5 text-sm font-medium text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
              >
                {isSaving ? t("saving") : t("save")}
              </button>
              <button
                onClick={cancel}
                disabled={isSaving}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                {t("cancel")}
              </button>
            </div>
            {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
          <div className="pt-1">
            <Switch
              checked={monthlySummary}
              onChange={toggleSummary}
              label={tp("emailNotifications.monthlySummaryToggle")}
              disabled={isTogglingSummary}
            />
          </div>

          {disabledHint ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{disabledHint}</p>
          ) : (
            <>
              <button
                onClick={handleSendNow}
                disabled={isSendingNow || !enabled || isDirty}
                className={buttonClass}
              >
                {isSendingNow ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {isSendingNow
                  ? tp("emailNotifications.sendNowSending")
                  : tp("emailNotifications.sendNowButton")}
              </button>
              {sendNowResult && "error" in sendNowResult && (
                <p className="text-sm text-red-600 dark:text-red-400">{sendNowResult.error}</p>
              )}
              {sendNowResult && "sent" in sendNowResult && (
                <p className="text-sm text-green-600 dark:text-green-500">
                  {sendNowResult.sent === 0
                    ? tp("emailNotifications.sendNowNoReminders")
                    : tp("emailNotifications.sendNowSent", { count: sendNowResult.sent })}
                </p>
              )}

              <button
                onClick={handleSendSummary}
                disabled={isSendingSummary || !enabled || !monthlySummary || isDirty}
                className={buttonClass}
              >
                {isSendingSummary ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <BarChart2 size={14} />
                )}
                {isSendingSummary
                  ? tp("emailNotifications.sendMonthlySummarySending")
                  : tp("emailNotifications.sendMonthlySummaryButton")}
              </button>
              {sendSummaryResult && "error" in sendSummaryResult && (
                <p className="text-sm text-red-600 dark:text-red-400">{sendSummaryResult.error}</p>
              )}
              {sendSummaryResult && "sent" in sendSummaryResult && (
                <p className="text-sm text-green-600 dark:text-green-500">
                  {sendSummaryResult.sent
                    ? tp("emailNotifications.sendMonthlySummarySent")
                    : tp("emailNotifications.sendMonthlySummaryNoData")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
