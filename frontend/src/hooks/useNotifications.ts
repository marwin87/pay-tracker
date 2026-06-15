"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fetchPayments } from "@/lib/payments-api";

const notificationsSupported =
  typeof window !== "undefined" && "Notification" in window;

function getPermission(): NotificationPermission {
  if (!notificationsSupported) return "denied";
  return Notification.permission;
}

export function useNotifications(): {
  permission: NotificationPermission;
  requestPermission: () => Promise<void>;
  notifyDueToday: () => Promise<void>;
} {
  const [permission, setPermission] = useState<NotificationPermission>(getPermission);
  const t = useTranslations("NotificationToggle");

  async function requestPermission() {
    if (!notificationsSupported) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  async function notifyDueToday() {
    if (!notificationsSupported || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;

    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
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

    const reg = await navigator.serviceWorker.ready;

    for (const p of due) {
      const key = `notified_${p.due_date}_${p.id}`;
      if (localStorage.getItem(key)) continue;
      const formattedDate = new Date(`${p.due_date}T12:00:00`).toLocaleDateString();
      await reg.showNotification(t("paymentIncoming"), {
        body: `${p.bill_name} — ${formattedDate}`,
        requireInteraction: true,
      });
      localStorage.setItem(key, "1");
    }
  }

  return { permission, requestPermission, notifyDueToday };
}
