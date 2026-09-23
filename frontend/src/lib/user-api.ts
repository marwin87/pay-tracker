import { apiFetch } from "@/lib/api";
import type { Locale } from "@/context/locale-context";

export interface UserProfile {
  email: string;
  language_preference: Locale | null;
  enabled_languages: Locale[];
  default_currency: string | null;
  email_reminders_enabled: boolean;
  notify_2_days_before: boolean;
  notify_1_day_before: boolean;
  notify_on_day: boolean;
  notify_1_day_after: boolean;
  reminder_send_minute: number;
  monthly_summary_enabled: boolean;
  telegram_chat_id: string | null;
  telegram_bot_token_set: boolean;
  telegram_bot_token_unreadable: boolean;
  telegram_reminders_enabled: boolean;
  telegram_notify_2_days_before: boolean;
  telegram_notify_1_day_before: boolean;
  telegram_notify_on_day: boolean;
  telegram_notify_1_day_after: boolean;
  telegram_send_minute: number;
  telegram_monthly_summary_enabled: boolean;
  browser_notifications_enabled: boolean;
}

export function fetchMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me");
}

export function updateMe(
  data: Partial<
    Pick<
      UserProfile,
      | "language_preference"
      | "enabled_languages"
      | "default_currency"
      | "email_reminders_enabled"
      | "notify_2_days_before"
      | "notify_1_day_before"
      | "notify_on_day"
      | "notify_1_day_after"
      | "reminder_send_minute"
      | "monthly_summary_enabled"
      | "telegram_chat_id"
      | "telegram_reminders_enabled"
      | "telegram_notify_2_days_before"
      | "telegram_notify_1_day_before"
      | "telegram_notify_on_day"
      | "telegram_notify_1_day_after"
      | "telegram_send_minute"
      | "telegram_monthly_summary_enabled"
      | "browser_notifications_enabled"
    >
  > & { telegram_bot_token?: string }, // write-only; "" clears
): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return apiFetch<void>("/auth/change-password", {
    method: "PATCH",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export function sendNotificationNow(
  channel: "email" | "telegram" = "email",
): Promise<{ sent: number }> {
  return apiFetch<{ sent: number }>(`/auth/send-notification-now?channel=${channel}`, {
    method: "POST",
  });
}

export function sendMonthlySummaryNow(
  channel: "email" | "telegram" = "email",
): Promise<{ sent: boolean }> {
  return apiFetch<{ sent: boolean }>(`/auth/send-monthly-summary-now?channel=${channel}`, {
    method: "POST",
  });
}

export function sendTelegramTest(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/send-telegram-test", {
    method: "POST",
  });
}

export function fetchServerTime(): Promise<{ server_time: string }> {
  return apiFetch<{ server_time: string }>("/auth/server-time");
}

export function changeEmail(
  newEmail: string,
  currentPassword: string,
): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/change-email", {
    method: "PATCH",
    body: JSON.stringify({
      new_email: newEmail,
      current_password: currentPassword,
    }),
  });
}

export function deleteAccount(): Promise<void> {
  return apiFetch<void>("/auth/users/me", { method: "DELETE" });
}
