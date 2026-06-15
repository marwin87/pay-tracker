"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fetchPayments } from "@/lib/payments-api";

const notificationsSupported =
  typeof window !== "undefined" && "Notification" in window;

function getPermission(): NotificationPermission {
  if (!notificationsSupported) return "default";
  return Notification.permission;
}

export function useNotifications(): {
  permission: NotificationPermission;
  requestPermission: () => Promise<void>;
  notifyDueToday: () => Promise<void>;
} {
  const [permission, setPermission] = useState<NotificationPermission>(getPermission);
  // Requires a next-intl NextIntlClientProvider ancestor — notification title is i18n'd here intentionally.
  const t = useTranslations("NotificationToggle");

  async function requestPermission() {
    if (!notificationsSupported) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  async function notifyDueToday() {
    if (!notificationsSupported || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;

    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local timezone
    const month = today.slice(0, 7); // YYYY-MM

    let payments;
    try {
      payments = await fetchPayments(month);
    } catch {
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

  return { permission, requestPermission, notifyDueToday };
}
