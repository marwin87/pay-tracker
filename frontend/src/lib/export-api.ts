const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export async function downloadBackup(): Promise<void> {
  const res = await fetch(`${BASE_URL}/export/json`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Backup failed: ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `pay-tracker-backup-${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreFromBackup(
  file: File
): Promise<{ restored_templates: number; restored_instances: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/export/restore`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `Restore failed: ${res.status}`);
  }
  return res.json();
}

export async function downloadXlsx(year: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/export/xlsx?year=${year}`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Export failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pay-tracker-${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
