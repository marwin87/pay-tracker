import { getAuthToken } from "@/lib/auth";

// Backs useSyncExternalStore in auth-context.tsx. The presence cookie is an
// external source React doesn't own, and it can only be read on the client —
// getServerSnapshot must return a fixed value so SSR and the client's first
// render agree, otherwise React flags a hydration mismatch. login()/logout()
// call notify() once the backend's Set-Cookie response has already landed.
let listeners: Array<() => void> = [];

export function subscribeAuthChange(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function notifyAuthChange(): void {
  for (const listener of listeners) listener();
}

export function getAuthSnapshot(): boolean {
  return getAuthToken() !== null;
}

export function getAuthServerSnapshot(): boolean {
  return false;
}
