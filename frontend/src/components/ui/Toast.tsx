"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2 } from "lucide-react";

const DURATION_MS = 3500;

export default function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(id);
  }, [message, onDone]);

  return createPortal(
    <div
      role="status"
      className="fixed inset-x-4 bottom-6 z-50 mx-auto flex w-fit max-w-full items-center gap-2 rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-medium text-green-800 shadow-lg dark:border-green-800 dark:bg-slate-800 dark:text-green-300"
    >
      <CheckCircle2 size={16} className="shrink-0" />
      <span className="truncate">{message}</span>
    </div>,
    document.body,
  );
}
