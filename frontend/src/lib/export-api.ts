import { getAuthToken } from "./auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export async function downloadXlsx(year: number): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${BASE_URL}/export/xlsx?year=${year}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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
