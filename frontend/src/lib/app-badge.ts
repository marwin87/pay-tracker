import { useSyncExternalStore } from "react";

let overdueCount = 0;
const listeners = new Set<() => void>();

// Overdue count shared with the UI (bottom tab badge).
export function useOverdueCount(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => overdueCount,
    () => 0,
  );
}

// Installed-PWA icon badge = overdue count; no-op where unsupported.
export function setOverdueBadge(overdue: number): void {
  overdueCount = overdue;
  listeners.forEach((cb) => cb());
  const nav = navigator as Navigator & {
    setAppBadge?: (count: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  (overdue > 0 ? nav.setAppBadge?.(overdue) : nav.clearAppBadge?.())?.catch(() => {});
}
