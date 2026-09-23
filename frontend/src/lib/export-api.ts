import { apiFetch, BASE_URL, extractApiError } from "./api";
import { getCsrfToken } from "./auth";

// `telegramTokenUnreadable`: the backup was made without the Telegram token because
// the server can no longer decrypt it (JWT_SECRET changed).
export const BACKUP_SECTIONS = [
  "bills",
  "categories",
  "email",
  "telegram",
  "languages",
  "currency",
] as const;
export type BackupSection = (typeof BACKUP_SECTIONS)[number];

export async function downloadBackup(
  sections: readonly BackupSection[] = BACKUP_SECTIONS
): Promise<{ telegramTokenUnreadable: boolean }> {
  const qs = sections.map((s) => `sections=${s}`).join("&");
  const res = await fetch(`${BASE_URL}/export/json?${qs}`, {
    credentials: "include",
  });

  if (!res.ok) throw await extractApiError(res);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `pay-tracker-backup-${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return {
    telegramTokenUnreadable:
      res.headers.get("X-Backup-Warning") === "telegram-token-unreadable",
  };
}

export async function restoreFromBackup(
  file: File
): Promise<{ restored_templates: number; restored_instances: number }> {
  const form = new FormData();
  form.append("file", file);
  const csrfToken = getCsrfToken();
  const res = await fetch(`${BASE_URL}/export/restore`, {
    method: "POST",
    credentials: "include",
    // No Content-Type here on purpose — the browser sets multipart/form-data
    // with the correct boundary itself; apiFetch can't be used since it
    // forces application/json.
    headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
    body: form,
  });
  if (!res.ok) throw await extractApiError(res);
  return res.json();
}

export async function getExportSummary(): Promise<{
  bill_count: number;
  payment_count: number;
}> {
  return apiFetch("/export/summary");
}

export async function getLastSnapshot(): Promise<{ created_at: string } | null> {
  const res = await fetch(`${BASE_URL}/export/last-snapshot`, {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await extractApiError(res);
  return res.json();
}

export async function restoreFromSnapshot(): Promise<{
  restored_templates: number;
  restored_instances: number;
}> {
  return apiFetch("/export/restore-snapshot", { method: "POST" });
}

export async function downloadXlsx(year: number, lang: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/export/xlsx?year=${year}&lang=${lang}`, {
    credentials: "include",
  });

  if (!res.ok) throw await extractApiError(res);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pay-tracker-${lang}-${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
