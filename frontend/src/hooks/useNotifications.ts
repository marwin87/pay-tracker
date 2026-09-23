"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchPayments } from "@/lib/payments-api";
import { fetchMe, updateMe } from "@/lib/user-api";

const notificationsSupported =
  typeof window !== "undefined" && "Notification" in window;

function getPermission(): NotificationPermission {
  if (!notificationsSupported) return "default";
  return Notification.permission;
}

// `initialPref` is the server-stored preference (Settings passes it from the profile).
export function useNotifications(initialPref = false): {
  permission: NotificationPermission;
  isEnabled: boolean;
  requestPermission: () => Promise<void>;
  setEnabled: (v: boolean) => void;
  notifyDueToday: () => Promise<void>;
} {
  const [permission, setPermission] = useState<NotificationPermission>(getPermission);
  // The preference is stored on the server (so it is backed up); permission is per browser.
  const [enabledPref, setEnabledPref] = useState(initialPref);
  // Requires a next-intl NextIntlClientProvider ancestor — notification title is i18n'd here intentionally.
  const t = useTranslations("NotificationToggle");

  // Track OS-level permission changes via the Permissions API.
  // navigator.permissions reflects macOS-level blocks even when Notification.permission still reads "granted".
  useEffect(() => {
    if (!notificationsSupported || !("permissions" in navigator)) return;
    let status: PermissionStatus;
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((s) => {
        status = s;
        setPermission(s.state as NotificationPermission);
        s.onchange = () => setPermission(s.state as NotificationPermission);
      })
      .catch(() => {});
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  const isEnabled = enabledPref && permission === "granted";

  function setEnabled(v: boolean) {
    setEnabledPref(v);
    updateMe({ browser_notifications_enabled: v }).catch(() => setEnabledPref(!v));
  }

  async function requestPermission() {
    if (!notificationsSupported) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      setEnabled(true);
    }
  }

  async function notifyDueToday() {
    if (!notificationsSupported || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;

    // Server preference, not localStorage: it survives a new browser and a restore.
    const me = await fetchMe().catch(() => null);
    if (!me?.browser_notifications_enabled) return;

    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local timezone
    const month = today.slice(0, 7); // YYYY-MM

    let payments;
    try {
      payments = await fetchPayments(month);
    } catch (err) {
      console.error("[useNotifications] fetchPayments failed:", err);
      return;
    }

    const due = payments.filter(
      (p) => p.due_date === today && p.status !== "paid",
    );

    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.ready;
    } catch {
      return;
    }

    // Prune dedup keys from past dates to prevent localStorage growth.
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("notified_") && !k.includes(`notified_${today}_`)) {
        localStorage.removeItem(k);
      }
    }

    for (const p of due) {
      const key = `notified_${p.due_date}_${p.id}`;
      if (localStorage.getItem(key)) continue;
      const formattedDate = new Date(`${p.due_date}T12:00:00`).toLocaleDateString();
      await reg.showNotification(t("paymentIncoming"), {
        body: `${p.bill_name} — ${formattedDate}`,
        requireInteraction: true,
      });
      try {
        localStorage.setItem(key, "1");
      } catch {
        // Storage quota exceeded — notification still shown, dedup skipped.
      }
    }
  }

  return { permission, isEnabled, requestPermission, setEnabled, notifyDueToday };
}
