import { apiFetch } from "@/lib/api";

export interface UserProfile {
  email: string;
  language_preference: "en" | "pl" | "de" | null;
  email_reminders_enabled: boolean;
  notify_2_days_before: boolean;
  notify_1_day_before: boolean;
  notify_on_day: boolean;
  notify_1_day_after: boolean;
  reminder_send_hour: number;
}

export function fetchMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me");
}

export function updateMe(
  data: Partial<
    Pick<
      UserProfile,
      | "language_preference"
      | "notify_2_days_before"
      | "notify_1_day_before"
      | "notify_on_day"
      | "notify_1_day_after"
      | "reminder_send_hour"
    >
  >,
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

export function sendNotificationNow(): Promise<{ sent: number }> {
  return apiFetch<{ sent: number }>("/auth/send-notification-now", {
    method: "POST",
  });
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
