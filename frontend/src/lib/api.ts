import { getCsrfToken } from "@/lib/auth";

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

// A 401 on this path is an expected outcome (bad credentials), not a
// sign of an expired session, so it must not trigger auto-logout.
// /auth/logout is exempt too: auth-context already swallows its errors, and a
// stale/duplicate logout call shouldn't also fire the global session-expired flow.
const AUTH_401_EXEMPT_PATHS = ["/auth/login", "/auth/logout"];

const CSRF_PROTECTED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

// AuthProvider registers itself here on mount so this module (which has no
// access to React context or the router) can notify it of an expired session.
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler;
}

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
  const method = (init?.method ?? "GET").toUpperCase();
  const csrfToken = CSRF_PROTECTED_METHODS.has(method) ? getCsrfToken() : null;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    ...(init?.headers ?? {}),
  };

  // credentials: "include" sends the HttpOnly access_token cookie automatically.
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 401 && !AUTH_401_EXEMPT_PATHS.includes(path)) {
      sessionExpiredHandler?.();
      throw new SessionExpiredError();
    }
    throw await extractApiError(res);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
