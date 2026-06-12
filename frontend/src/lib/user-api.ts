import { apiFetch } from "@/lib/api";

export interface UserProfile {
  email: string;
  language_preference: "en" | "pl" | null;
}

export function fetchMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me");
}

export function updateMe(data: { language_preference: string }): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
