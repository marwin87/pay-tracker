"use client";

import { useCallback, useState } from "react";

// Every page's collapse-state storage key, in one place so a fresh login can
// reset them all — collapse state should survive page-to-page navigation
// within a session, but not survive a logout/login (or a different user
// signing in on the same browser).
export const COLLAPSED_CATEGORIES_KEYS = {
  bills: "bills-collapsed-categories",
  payments: "payments-collapsed-categories",
} as const;

function readFromStorage(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed as string[]);
      }
    }
  } catch {
    // ignore malformed storage
  }
  return new Set<string>();
}

export function useCollapsedCategories(
  storageKey: string,
  allKeys: readonly string[],
) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => readFromStorage(storageKey),
  );

  const persist = useCallback(
    (next: Set<string>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // ignore storage errors (e.g. private browsing quota)
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (key: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const collapseAll = useCallback(() => {
    const next = new Set(allKeys);
    setCollapsed(next);
    persist(next);
  }, [allKeys, persist]);

  const expandAll = useCallback(() => {
    const next = new Set<string>();
    setCollapsed(next);
    persist(next);
  }, [persist]);

  const allCollapsed = allKeys.length > 0 && allKeys.every((k) => collapsed.has(k));
  const anyExpanded = allKeys.some((k) => !collapsed.has(k));

  return { collapsed, toggle, collapseAll, expandAll, allCollapsed, anyExpanded };
}
