const PRESENCE_COOKIE = "auth_logged_in";

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

// setAuthToken and clearAuthToken are handled by backend Set-Cookie headers.
// Login sets both cookies; POST /auth/logout clears them.
