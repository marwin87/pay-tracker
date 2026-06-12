const COOKIE_NAME = "auth_token";

export function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const idx = match.indexOf("=");
  return idx !== -1 ? match.slice(idx + 1) : null;
}

export function setAuthToken(token: string): void {
  document.cookie = `${COOKIE_NAME}=${token}; path=/; SameSite=Lax`;
}

export function clearAuthToken(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; SameSite=Lax; max-age=0`;
}
