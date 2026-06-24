const PRESENCE_COOKIE = "auth_logged_in";

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
