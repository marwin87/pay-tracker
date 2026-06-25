export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export async function extractApiError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  const detail = (body as { detail?: unknown }).detail;
  const message = Array.isArray(detail)
    ? detail.map((e: { msg?: string }) => e.msg ?? String(e)).join("; ")
    : (detail ?? `Request failed with status ${res.status}`);
  return new Error(String(message));
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers ?? {}),
  };

  // credentials: "include" sends the HttpOnly access_token cookie automatically.
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    throw await extractApiError(res);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
