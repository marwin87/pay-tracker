import { apiFetch } from "@/lib/api";

export interface UserProfile {
  email: string;
  language_preference: "en" | "pl" | "de" | null;
  email_reminders_enabled: boolean;
}

export function fetchMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me");
}

export function updateMe(
  data: Partial<Pick<UserProfile, "language_preference" | "email_reminders_enabled">>,
): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
