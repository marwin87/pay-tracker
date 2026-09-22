"use client";

import { useCallback, useState } from "react";

function readFromStorage<T extends string>(
  storageKey: string,
  fallback: T,
  valid: readonly T[],
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw && (valid as readonly string[]).includes(raw)) return raw as T;
  } catch {
    // ignore malformed storage
  }
  return fallback;
}

export function useSortOption<T extends string>(
  storageKey: string,
  fallback: T,
  valid: readonly T[],
) {
  const [option, setOptionState] = useState<T>(() =>
    readFromStorage(storageKey, fallback, valid),
  );

  const setOption = useCallback(
    (next: T) => {
      setOptionState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // ignore storage errors (e.g. private browsing quota)
      }
    },
    [storageKey],
  );

  return [option, setOption] as const;
}
