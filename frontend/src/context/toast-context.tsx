"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import Toast from "@/components/ui/Toast";

const ToastContext = createContext<(message: string) => void>(() => {});

const FLASH_KEY = "flash_toast";

/** Shorten a user-entered name so it fits in a toast. */
export function toastName(name: string, max = 30): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

/** Queue a toast for after a full page reload (e.g. after restoring a backup). */
export function flashToastAfterReload(message: string): void {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    /* storage blocked: the toast is simply skipped */
  }
}

function readFlash(): string | null {
  try {
    return sessionStorage.getItem(FLASH_KEY);
  } catch {
    return null;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // The provider only mounts after hydration (the dashboard layout renders null until then),
  // so reading storage in the initializer is safe. Removal waits for the effect, so a
  // double-invoked initializer (Strict Mode) can't lose the message.
  const [message, setMessage] = useState<string | null>(readFlash);
  const clear = useCallback(() => setMessage(null), []);

  useEffect(() => {
    try {
      sessionStorage.removeItem(FLASH_KEY);
    } catch {
      /* storage blocked */
    }
  }, []);

  return (
    <ToastContext.Provider value={setMessage}>
      {children}
      {message && <Toast message={message} onDone={clear} />}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
