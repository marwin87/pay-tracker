const PRESENCE_COOKIE = "auth_logged_in";
const CSRF_COOKIE = "csrf_token";

// Flag read once by the login page to show a "session expired" message.
// A sessionStorage flag (not a ?reason= query param) survives the extra
// router.replace("/login") that dashboard/layout.tsx fires when isAuthenticated
// flips to false, which would otherwise race and strip a query param.
export const SESSION_EXPIRED_KEY = "pt_session_expired";

/**
 * Returns true when the backend-set presence flag cookie exists.
 * The actual JWT lives in an HttpOnly cookie not readable from JS.
 */
export function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${PRESENCE_COOKIE}=`));
  return match ? "1" : null;
}

/**
 * Reads the non-HttpOnly CSRF cookie so it can be echoed back as the
 * X-CSRF-Token header on mutating requests (double-submit CSRF check).
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

/**
 * Expires the presence cookie from the client. A real /auth/logout call
 * already gets this cleared via the backend's Set-Cookie response, but a
 * session-expired 401 (token revoked/expired without the user hitting
 * logout) never touches this cookie server-side — the JWT itself dies, but
 * this one would otherwise sit valid until its own max-age runs out, keeping
 * the UI's auth state stuck "logged in".
 */
export function clearAuthPresence(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PRESENCE_COOKIE}=; Max-Age=0; path=/`;
}

// Login sets both cookies via the backend's Set-Cookie response headers.
