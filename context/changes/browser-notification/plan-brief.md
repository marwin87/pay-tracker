# Browser Notifications for Bill Due Dates — Plan Brief

> Full plan: `context/changes/browser-notification/plan.md`

## What & Why

Add client-side browser notifications so users are reminded when a bill is due today. No backend changes needed — the service worker already registered in the PWA is sufficient for `showNotification()`. The feature is purely client-side, triggered each time the user opens the dashboard.

## Starting Point

The PWA has a passthrough service worker (`public/sw.js`) and a `PwaRegister` component. The `fetchPayments(month)` API already returns `due_date`, `status`, `bill_name`, `amount`, and `currency`. The dashboard header has an established icon-button pattern (`ThemeToggle`, `LanguageToggle`, `BackupButton`, `RestoreButton`) that this feature mirrors exactly.

## Desired End State

A Bell icon sits in the dashboard header. First click triggers the browser permission prompt. Once granted, every app open fires one browser notification per unpaid bill due today — title is the bill name, body is the amount and currency. Re-opening the same day does not re-notify (localStorage dedup). If notifications are browser-blocked, the icon is disabled with a tooltip.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Trigger type | Client-side only (no push) | No backend changes needed; app-open is sufficient for a reminder | Plan |
| When to notify | Due date only | User requested exact due-date alerts, not advance reminders | Plan session |
| Notification grouping | One per bill | More actionable than a grouped summary | Plan session |
| Deduplication | localStorage, once per day per bill | Prevents re-notification on page reload without requiring a backend | Plan |
| Button placement | Header icon-only, desktop + mobile | Matches existing toggle pattern; minimal footprint | Plan session |
| Auto-check on load | Yes, if permission granted | Zero friction after initial setup | Plan session |
| i18n coverage | en + pl + de | Consistent with existing locale contract | Plan session |

## Scope

**In scope:**
- `useNotifications` hook (permission state, `requestPermission`, `notifyDueToday`)
- `NotificationToggle` component (Bell / BellRing / BellOff states)
- Wire into dashboard layout header (desktop + mobile)
- i18n keys for all three locales

**Out of scope:**
- Push notifications / VAPID / backend subscription management
- Advance reminders (N days before due)
- Overdue alerts
- In-app notification inbox
- Service worker changes

## Architecture / Approach

```
DashboardLayout
  └── NotificationToggle (new)
        └── useNotifications (new hook)
              ├── Notification API (browser built-in)
              ├── fetchPayments() (existing, lib/payments-api.ts)
              └── localStorage (dedup)
```

On mount, if `Notification.permission === "granted"`, the component calls `notifyDueToday()` which fetches the current month's payments, filters for today's unpaid bills, and fires `ServiceWorkerRegistration.showNotification()` for each non-deduplicated bill.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Notification Hook | `useNotifications` with permission state + notify logic | `fetchPayments` month string must match backend format |
| 2. NotificationToggle Component | Icon button + i18n keys | iOS PWA requires app to be installed; desktop-only in dev |
| 3. Wire into Dashboard | Bell in header, auto-check on load | Layout regression in mobile dropdown |

**Prerequisites:** App running locally (`npm run dev`); a bill with `due_date = today` for manual testing  
**Estimated effort:** ~1 session across 3 short phases

## Open Risks & Assumptions

- iOS 16.4+ and "Add to Home Screen" are required for notifications on Safari/iOS — users on older iOS or mobile browsers get no notification but also no crash (guarded by feature detection)
- The `fetchPayments` API is authenticated — if the user's token is expired on load, `notifyDueToday` will silently fail (acceptable; the user will see auth redirect anyway)

## Success Criteria (Summary)

- Bell icon in header triggers browser permission prompt on first click
- Unpaid bills due today each produce one browser notification on app open
- Re-opening the app on the same day produces no duplicate notifications
