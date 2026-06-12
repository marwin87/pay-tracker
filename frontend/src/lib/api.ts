import { getAuthToken } from "./auth";

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getAuthToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    const message = Array.isArray(detail)
      ? detail.map((e: { msg?: string }) => e.msg ?? String(e)).join("; ")
      : (detail ?? `Request failed with status ${res.status}`);
    throw new Error(message);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
