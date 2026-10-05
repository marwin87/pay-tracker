"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import Toast from "@/components/ui/Toast";

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const clear = useCallback(() => setMessage(null), []);

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
