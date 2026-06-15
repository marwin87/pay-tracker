# Browser Notifications for Bill Due Dates — Implementation Plan

## Overview

Add client-side browser notifications to the Pay Tracker PWA that fire when a bill is due today. The user grants permission via a Bell icon in the dashboard header; from then on, opening the app automatically checks for unpaid bills due today and shows one notification per bill.

## Current State Analysis

The PWA already has a registered service worker (`public/sw.js`) that passes all requests through — sufficient for `ServiceWorkerRegistration.showNotification()`, which is what mobile PWA requires. The `PwaRegister` component handles SW registration. The `fetchPayments(month)` function in `lib/payments-api.ts` returns `PaymentInstanceOut[]` with `due_date`, `status`, `bill_name`, `amount`, and `currency` — everything needed. The dashboard header already has a pattern of icon-only utility buttons (`ThemeToggle`, `LanguageToggle`, `BackupButton`, `RestoreButton`) that this feature mirrors exactly.

### Key Discoveries

- `frontend/src/components/pwa-register.tsx` — SW registration (no changes needed)
- `frontend/src/lib/payments-api.ts:22` — `fetchPayments(month: string)` returns `PaymentInstanceOut[]`
- `frontend/src/app/dashboard/layout.tsx:84-97` — desktop right side utility row (insertion point)
- `frontend/src/app/dashboard/layout.tsx:134-145` — mobile dropdown utility row (second insertion point)
- `frontend/messages/en.json` — locale structure with top-level namespace keys (e.g., `"DashboardLayout"`)

## Desired End State

A Bell icon appears in the dashboard header (desktop and mobile). On first click the browser permission prompt fires. Once granted, every time the user opens the dashboard, unpaid bills due today each trigger one browser notification (title = bill name, body = amount + currency). Re-opening the app on the same day does not re-fire already-shown notifications. If the browser has blocked notifications, the icon is dimmed and non-interactive.

## What We're NOT Doing

- No push notifications (no VAPID keys, no backend changes, no subscription management)
- No "N days before" advance reminders
- No overdue alerts
- No notification centre / inbox inside the app
- No service worker changes (passthrough SW is sufficient)
- No settings page (future scope)

## Implementation Approach

Three pieces in sequence: (1) a hook that owns permission state and the check-and-notify logic, (2) a toggle component that wires the hook to the UI, (3) wiring the component into the dashboard layout and locale files.

## Phase 1: Notification Hook

### Overview

Encapsulate all Notification API logic in one hook so the component stays thin.

### Changes Required

#### 1. New hook

**File**: `frontend/src/hooks/useNotifications.ts`

**Intent**: Expose `permission` state, `requestPermission()`, and `notifyDueToday()` so any component can drive notification behaviour without owning the API calls or dedup logic.

**Contract**:

```ts
export function useNotifications(): {
  permission: NotificationPermission;   // "default" | "granted" | "denied"
  requestPermission: () => Promise<void>;
  notifyDueToday: () => Promise<void>;
}
```

`notifyDueToday` implementation steps:
1. Build today's ISO date string (`YYYY-MM-DD`) and the month string (`YYYY-MM`) using the locale-independent `toISOString()` split approach.
2. Call `fetchPayments(month)` from `lib/payments-api.ts`.
3. Filter: `p.due_date === today && p.status !== "paid"`.
4. For each match, check `localStorage.getItem(`notified_${p.due_date}_${p.id}`)` — skip if set.
5. Await `navigator.serviceWorker.ready` then call `reg.showNotification(p.bill_name, { body: `${p.amount} ${p.currency}` })`.
6. Set `localStorage.setItem(`notified_${p.due_date}_${p.id}`, "1")`.

`requestPermission` calls `Notification.requestPermission()` and updates the `permission` state atom.

Guard the entire hook against SSR: check `typeof window !== "undefined"` and `"Notification" in window` before touching the API — return no-op functions if unavailable.

### Success Criteria

#### Automated Verification

- TypeScript compiles with no errors: `cd frontend && npm run build`
- ESLint passes: `cd frontend && npm run lint`

#### Manual Verification

- Hook can be imported in a test component without runtime errors
- `notifyDueToday()` with `permission = "default"` does nothing (no prompt, no notification)

---

## Phase 2: NotificationToggle Component

### Overview

Icon-only button following the `ThemeToggle` / `LanguageToggle` pattern. Handles three visual states and triggers the hook on click and on mount.

### Changes Required

#### 1. New component

**File**: `frontend/src/components/NotificationToggle.tsx`

**Intent**: Render a Bell icon button with three states driven by `useNotifications()`. On mount, auto-fire `notifyDueToday()` if permission is already granted. On click, request permission (if default) then check.

**Contract**:

State → icon → behaviour mapping:
- `"default"` → `Bell` (Lucide) → on click: `requestPermission()` then `notifyDueToday()`
- `"granted"` → `BellRing` (Lucide) → on click: `notifyDueToday()` (manual re-check); on mount: `notifyDueToday()`
- `"denied"` → `BellOff` (Lucide) → `disabled` attribute; `aria-label` = i18n `"blocked"` key

The `useEffect` for auto-check on mount:
```ts
useEffect(() => {
  if (permission === "granted") notifyDueToday();
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Tailwind classes should match `ThemeToggle` — `rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors`. Icon size 18 (matches other toggles).

#### 2. i18n keys — English

**File**: `frontend/messages/en.json`

**Intent**: Add a `NotificationToggle` namespace with three keys used as `aria-label`.

**Contract**:
```json
"NotificationToggle": {
  "enable": "Enable notifications",
  "enabled": "Notifications enabled — click to re-check",
  "blocked": "Notifications blocked — allow in browser settings"
}
```

#### 3. i18n keys — Polish

**File**: `frontend/messages/pl.json`

**Intent**: Polish translations for the same three keys.

**Contract**:
```json
"NotificationToggle": {
  "enable": "Włącz powiadomienia",
  "enabled": "Powiadomienia włączone — kliknij, aby sprawdzić",
  "blocked": "Powiadomienia zablokowane — zezwól w ustawieniach przeglądarki"
}
```

#### 4. i18n keys — German

**File**: `frontend/messages/de.json`

**Intent**: German translations for the same three keys.

**Contract**:
```json
"NotificationToggle": {
  "enable": "Benachrichtigungen aktivieren",
  "enabled": "Benachrichtigungen aktiviert — klicken zum Prüfen",
  "blocked": "Benachrichtigungen blockiert — in Browsereinstellungen erlauben"
}
```

### Success Criteria

#### Automated Verification

- TypeScript compiles with no errors: `cd frontend && npm run build`
- ESLint passes: `cd frontend && npm run lint`

#### Manual Verification

- Bell icon appears correctly sized alongside other toggles in Storybook or the running app
- Clicking Bell in `"default"` state triggers the browser permission prompt
- After granting, icon changes to BellRing
- After denying, icon changes to BellOff and is non-interactive

---

## Phase 3: Wire into Dashboard Layout

### Overview

Add `NotificationToggle` to both the desktop utility row and the mobile dropdown, matching the existing insertion pattern.

### Changes Required

#### 1. Desktop right side

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Import `NotificationToggle` and add it to the desktop utility `<div>` at line 84, positioned between `RestoreButton` and `ThemeToggle` (consistent ordering: data operations → notification → display toggles → logout).

**Contract**: Add `<NotificationToggle />` between `<RestoreButton />` and `<ThemeToggle />` inside the `hidden md:flex` div.

#### 2. Mobile dropdown

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Add `NotificationToggle` to the mobile dropdown utility row at line 134 in the same relative position.

**Contract**: Add `<NotificationToggle />` between `<RestoreButton />` and `<ThemeToggle />` inside the mobile dropdown utility `<div>`.

### Success Criteria

#### Automated Verification

- TypeScript compiles with no errors: `cd frontend && npm run build`
- ESLint passes: `cd frontend && npm run lint`

#### Manual Verification

- Bell icon visible in desktop header between RestoreButton and ThemeToggle
- Bell icon visible in mobile hamburger menu
- Full flow works end-to-end:
  1. Open dashboard → browser asks for notification permission (first time)
  2. Grant → BellRing icon shown; notification fires for each unpaid bill due today
  3. Reload → no duplicate notifications (localStorage dedup)
  4. Block notifications in browser settings → BellOff icon shown, button disabled
- Dark mode: icon colour matches other toggles

---

## Testing Strategy

### Manual Testing Steps

1. Start app: `cd frontend && npm run dev`
2. Navigate to `/dashboard`
3. Click the Bell icon — browser permission prompt should appear
4. Grant permission — icon becomes BellRing
5. If any bill has `due_date = today` and `status ≠ "paid"`: notification fires
6. Reload the page — no second notification for the same bills (check localStorage in DevTools)
7. Open browser notification settings → block for this site → icon becomes BellOff and click does nothing
8. Test on mobile viewport in Chrome DevTools responsive mode

## References

- `frontend/src/components/ThemeToggle.tsx` — style template for the toggle button
- `frontend/src/lib/payments-api.ts` — `fetchPayments` and `PaymentInstanceOut` type
- `frontend/src/components/pwa-register.tsx` — SW registration (no changes)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Notification Hook

#### Automated

- [x] 1.1 TypeScript compiles: `cd frontend && npm run build`
- [x] 1.2 ESLint passes: `cd frontend && npm run lint`

#### Manual

- [x] 1.3 Hook importable without runtime errors
- [x] 1.4 `notifyDueToday()` with `permission="default"` does nothing

### Phase 2: NotificationToggle Component

#### Automated

- [x] 2.1 TypeScript compiles: `cd frontend && npm run build`
- [x] 2.2 ESLint passes: `cd frontend && npm run lint`

#### Manual

- [x] 2.3 Bell icon appears correctly sized alongside other toggles
- [x] 2.4 Clicking Bell in default state triggers browser permission prompt
- [x] 2.5 After grant: icon changes to BellRing
- [x] 2.6 After deny: icon changes to BellOff, button disabled

### Phase 3: Wire into Dashboard Layout

#### Automated

- [x] 3.1 TypeScript compiles: `cd frontend && npm run build`
- [x] 3.2 ESLint passes: `cd frontend && npm run lint`

#### Manual

- [x] 3.3 Bell icon visible in desktop header between RestoreButton and ThemeToggle
- [x] 3.4 Bell icon visible in mobile dropdown
- [x] 3.5 Full flow: permission prompt → grant → notification fires for today's due bills
- [x] 3.6 Reload: no duplicate notifications
- [x] 3.7 Block in browser settings: BellOff shown, button disabled
- [x] 3.8 Dark mode: icon colour matches other toggles
