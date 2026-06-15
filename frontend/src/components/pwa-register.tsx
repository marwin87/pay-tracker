"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => {
          if (process.env.NODE_ENV !== "production")
            console.warn("SW registration failed:", err);
        });
    }
  }, []);

  return null;
}
