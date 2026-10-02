// Installed-PWA icon badge = overdue count; no-op where unsupported.
export function setOverdueBadge(overdue: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (count: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  (overdue > 0 ? nav.setAppBadge?.(overdue) : nav.clearAppBadge?.())?.catch(() => {});
}
