"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme, getTheme } from "@/lib/theme";

/** Re-applies the stored theme classes to <html> after hydration and on every route change,
 *  in case React's reconciliation of the <html> className dropped them. */
export default function ThemeSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyTheme(getTheme());
  }, [pathname]);
  return null;
}
