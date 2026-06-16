# Notification Toggles Implementation Plan

## Overview

Add a master on/off toggle to the Email Notifications tile and a user-preference toggle to the Browser Notifications tile. Both are frontend-only changes. The `email_reminders_enabled` backend field already exists; the browser toggle is stored in localStorage only.

## Current State Analysis

- `EmailNotificationsTile` is defined inline in `frontend/src/app/dashboard/settings/page.tsx` (~lines 321–505). It has local state, dirty tracking, `save()`/`cancel()`, and a "Send Now" button. The master toggle field `email_reminders_enabled` exists in `UserProfile` and `updateMe()` — but the tile never renders it as a switch.
- `BrowserNotificationsTile` (~lines 511–552) is thin: it calls `useNotifications()` and shows three states (denied / granted / default). No user preference exists yet.
- `useNotifications` (`frontend/src/hooks/useNotifications.ts`) returns `permission`, `requestPermission`, and `notifyDueToday`. No `isEnabled`/`setEnabled`.
- No `Switch` UI primitive exists. All toggles in the project are hand-rolled with Tailwind.
- Translation files live at `frontend/messages/{en,pl,de}.json`. Both `emailNotifications` and `browserNotifications` sections exist but lack the new toggle keys.

## Desired End State

- Email tile has a pill toggle at the top. When off, all child controls are dimmed and non-interactive. The toggle participates in dirty/save/cancel. "Send Now" checks local toggle state, not the stale profile prop.
- Browser tile when permission is "granted" shows: (a) the green "permission enabled" indicator and (b) a pill toggle for the user's notification preference. `notifyDueToday` respects that preference.
- Three translation files each have two new keys.

### Key Discoveries

- `email_reminders_enabled` is already in `UserProfile` and `updateMe()` accepts it — zero backend work needed.
- "Send Now" disabled condition at line 474 reads `!profile.email_reminders_enabled` — this is the line to fix.
- `isDirty` at line 346–351 does not include `email_reminders_enabled` — needs the extra clause.
- `notifyDueToday` fires from `NotificationToggle.tsx` (header component) on mount. The hook's `isEnabled` guard only needs to prevent the notification from showing, not from being requested.
- `requestPermission` resolves to "granted" — the first grant should auto-set `browser_notif_enabled = "1"` in localStorage so the toggle defaults to enabled.

## What We're NOT Doing

- No backend changes (no new schema, no migration, no router change).
- No changes to `NotificationToggle.tsx` (header bell icon component) or `EmailRemindersToggle.tsx`.
- No changes to the service worker or notification payload.
- No dirty/save cycle for the browser toggle — it is a client preference stored directly in localStorage.

## Addendum (impl-review 2026-06-16)

During implementation, `void notifyDueToday()` was added to `frontend/src/app/login/page.tsx` immediately after `login()` succeeds. This fires a due-today notification at login time. It was not in the original plan but is safe: the `localStorage` guard in `notifyDueToday` means it is a no-op unless the user has both granted OS permission and enabled the in-app toggle.

## Implementation Approach

1. Build a reusable `Switch` component using a hidden HTML checkbox + Tailwind `peer-*` classes (standard pill-toggle pattern, no external library).
2. Wire `emailEnabled` into the existing `EmailNotificationsTile` state machine — minimal footprint: one new state variable, one line in `isDirty`, one line in `cancel()`, one field in `save()`, one fix to the "Send Now" disabled condition.
3. Extend `useNotifications` with `isEnabled`/`setEnabled` backed by localStorage key `browser_notif_enabled`.
4. Update `BrowserNotificationsTile` to show both the permission indicator and the preference toggle when `permission === "granted"`.
5. Add two translation keys per locale (6 strings total).

---

## Phase 1: Shared Switch Component

### Overview

Create a reusable pill-toggle component that both tiles will use. It wraps a visually hidden `<input type="checkbox" role="switch">` — accessible, keyboard-navigable, and styled with Tailwind `peer-*` classes.

### Changes Required

#### 1. Switch component

**File**: `frontend/src/components/ui/Switch.tsx`

**Intent**: New component. Renders a pill toggle with an accessible label. Callers pass `checked`, `onChange`, `label`, and optional `disabled`.

**Contract**: Export named `Switch`. Props: `checked: boolean`, `onChange: (v: boolean) => void`, `label: string`, `disabled?: boolean`. The checkbox uses `role="switch"` and `className="sr-only peer"`. The visual pill uses `peer-checked:bg-green-600` (active) vs `bg-slate-300` (inactive). The thumb translates right on check via `peer-checked:translate-x-5`. Dark-mode variants on all color classes.

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no new errors in `Switch.tsx`
- TypeScript compilation (`npm run build` or `npx tsc --noEmit`) passes

#### Manual Verification

- Import Switch into a scratch context and confirm the pill toggles visually and announces state correctly with a screen reader (or browser accessibility inspector)

---

## Phase 2: Email Master Toggle

### Overview

Add `emailEnabled` local state to `EmailNotificationsTile`, render the Switch at the top of the tile, wrap all child controls in a dimming container, and wire `emailEnabled` into the existing dirty/save/cancel/send-now logic.

### Changes Required

#### 1. New state variable

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Add `emailEnabled` state initialized from `profile.email_reminders_enabled`.

**Contract**: Add `const [emailEnabled, setEmailEnabled] = useState(profile.email_reminders_enabled);` alongside the existing notification state variables (~line 334).

#### 2. Extend isDirty

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Make the tile dirty when the master toggle differs from the saved profile value.

**Contract**: Append `|| emailEnabled !== profile.email_reminders_enabled` to the `isDirty` expression (~line 346–351).

#### 3. Extend cancel()

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Reset `emailEnabled` when the user cancels edits.

**Contract**: Add `setEmailEnabled(profile.email_reminders_enabled);` inside `cancel()` (~line 359–366).

#### 4. Extend save()

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Persist the master toggle to the backend on save.

**Contract**: Add `email_reminders_enabled: emailEnabled` to the `updateMe({…})` call inside `save()` (~line 372–379).

#### 5. Fix "Send Now" disabled condition

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: "Send Now" should reflect unsaved toggle state, not the stale profile prop.

**Contract**: At line ~474, replace `!profile.email_reminders_enabled` with `!emailEnabled`.

#### 6. Render Switch and dimming wrapper

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: Render the master toggle above all child controls; dim children when toggle is off.

**Contract**: Inside `EmailNotificationsTile`'s JSX (inside `<Tile …>`), before the checkboxes `<div>`:
- Add `<Switch checked={emailEnabled} onChange={setEmailEnabled} label={tp("emailNotifications.masterToggle")} />`.
- Wrap the existing checkboxes block, the `noneSelected` warning, the send-hour row, and the send-now row in a single `<div className={!emailEnabled ? "opacity-50 pointer-events-none" : ""}>`…`</div>`. The Switch itself stays outside this wrapper so it remains interactive at all times.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- TypeScript compilation passes

#### Manual Verification

- Toggle OFF: all checkboxes, the hour selector, and "Send Now" button are visually dimmed and unclickable
- Toggle OFF then back ON: controls restore to fully interactive
- Toggle OFF → Save: tile saves `email_reminders_enabled: false` (verify via browser DevTools Network tab — PATCH `/auth/me` body)
- Toggle OFF → Cancel: toggle snaps back to the saved profile value
- "Send Now" button remains disabled when `emailEnabled` is false even before saving
- Save/Cancel footer appears whenever `emailEnabled` differs from the profile value

---

## Phase 3: Browser Notifications Toggle

### Overview

Extend `useNotifications` with a localStorage-backed `isEnabled`/`setEnabled` pair. Update `BrowserNotificationsTile` to show both the browser permission indicator and the user-preference toggle when permission is granted.

### Changes Required

#### 1. Extend useNotifications hook

**File**: `frontend/src/hooks/useNotifications.ts`

**Intent**: Add `isEnabled`/`setEnabled` backed by localStorage key `browser_notif_enabled`. `notifyDueToday` early-returns when the user has disabled the preference. First-time permission grant auto-sets the key to `"1"`.

**Contract**:

- Add module-level constant `const BROWSER_NOTIF_KEY = "browser_notif_enabled";`.

- Add a `getInitialEnabled()` helper (called once on hook init):
  ```
  Returns false if notificationsSupported is false or Notification.permission !== "granted".
  If permission is granted, returns localStorage.getItem(BROWSER_NOTIF_KEY) !== "0"
  (i.e., defaults to true when key is absent).
  ```

- Add `const [isEnabled, setIsEnabledState] = useState(getInitialEnabled);`.

- Add `function setEnabled(v: boolean)`:  sets `localStorage.setItem(BROWSER_NOTIF_KEY, v ? "1" : "0")` then calls `setIsEnabledState(v)`.

- Inside `requestPermission()`, after `setPermission(result)`, add: if `result === "granted"`, call `setEnabled(true)` to auto-enable on first grant.

- At the top of `notifyDueToday()`, add an early return guard: `if (!isEnabled) return;`.

- Add `isEnabled` and `setEnabled` to the return object and the return type signature.

#### 2. Update BrowserNotificationsTile

**File**: `frontend/src/app/dashboard/settings/page.tsx`

**Intent**: When permission is "granted", show the permission indicator AND the user-preference toggle side by side (or stacked). The indicator communicates the OS/browser state; the toggle communicates the user's in-app preference.

**Contract**: Destructure `isEnabled` and `setEnabled` from `useNotifications()`. In the `permission === "granted"` branch, render:
1. The existing green "Notifications enabled" row (unchanged — communicates browser permission).
2. Below it, `<Switch checked={isEnabled} onChange={setEnabled} label={tp("browserNotifications.toggle")} />`.

The "denied" and "default" branches are unchanged.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- TypeScript compilation passes

#### Manual Verification

- With permission granted: tile shows both the green "enabled" indicator and the toggle switch
- Toggle OFF: `localStorage.getItem("browser_notif_enabled")` === `"0"` (verify in browser DevTools → Application → Local Storage)
- Toggle OFF: `notifyDueToday()` does not fire notifications (can verify by triggering from `NotificationToggle` header bell)
- Toggle ON: notifications resume
- First time granting permission (from "default"): toggle appears in ON state automatically
- Page refresh: toggle state persists from localStorage

---

## Phase 4: Translations

### Overview

Add two new keys to each of the three locale files.

### Changes Required

#### 1. English translations

**File**: `frontend/messages/en.json`

**Intent**: Add `masterToggle` to `emailNotifications` section and `toggle` to `browserNotifications` section.

**Contract**:
- `emailNotifications.masterToggle`: `"Enable email notifications"`
- `browserNotifications.toggle`: `"Enable browser notifications"`

#### 2. Polish translations

**File**: `frontend/messages/pl.json`

**Intent**: Same keys in Polish.

**Contract**:
- `emailNotifications.masterToggle`: `"Włącz powiadomienia e-mail"`
- `browserNotifications.toggle`: `"Włącz powiadomienia przeglądarki"`

#### 3. German translations

**File**: `frontend/messages/de.json`

**Intent**: Same keys in German.

**Contract**:
- `emailNotifications.masterToggle`: `"E-Mail-Benachrichtigungen aktivieren"`
- `browserNotifications.toggle`: `"Browser-Benachrichtigungen aktivieren"`

### Success Criteria

#### Automated Verification

- `npm run lint` passes (next-intl will surface missing keys at build time if any key referenced in JSX is absent)
- TypeScript compilation passes

#### Manual Verification

- Switch language to each of EN / PL / DE and confirm the toggle labels render correctly in both tiles

---

## Testing Strategy

### Manual Testing Steps

1. Settings → Email Notifications → toggle OFF → verify all child controls dim
2. Toggle OFF → click Save → PATCH body contains `email_reminders_enabled: false`
3. Toggle OFF → click Cancel → toggle snaps back to saved value
4. Toggle ON → "Send Now" becomes enabled (if no unsaved changes)
5. Browser Notifications → grant permission → confirm both green indicator and toggle appear
6. Toggle OFF → refresh → toggle stays OFF
7. Toggle OFF → trigger bell icon in header → confirm no notification fires
8. Switch language between EN / PL / DE → confirm toggle labels translate

### Performance Considerations

None — all changes are local state and localStorage reads (synchronous, tiny).

## References

- Change notes: `context/changes/notification-toggles/change.md`
- Settings page: `frontend/src/app/dashboard/settings/page.tsx` lines 321–552
- Notifications hook: `frontend/src/hooks/useNotifications.ts`
- User API types: `frontend/src/lib/user-api.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared Switch Component

#### Automated

- [x] 1.1 `npm run lint` passes with no new errors in `Switch.tsx`
- [x] 1.2 TypeScript compilation passes

#### Manual

- [x] 1.3 Pill toggles visually and announces state correctly

### Phase 2: Email Master Toggle

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 TypeScript compilation passes

#### Manual

- [x] 2.3 Toggle OFF dims all child controls and blocks interaction
- [x] 2.4 Toggle OFF → Save persists `email_reminders_enabled: false` via PATCH `/auth/me`
- [x] 2.5 Toggle OFF → Cancel snaps back to saved value
- [x] 2.6 "Send Now" disabled when `emailEnabled` is false
- [x] 2.7 Save/Cancel footer appears when toggle differs from profile

### Phase 3: Browser Notifications Toggle

#### Automated

- [x] 3.1 `npm run lint` passes
- [x] 3.2 TypeScript compilation passes

#### Manual

- [x] 3.3 Both green indicator and toggle visible when permission is granted
- [x] 3.4 Toggle OFF writes `"0"` to `localStorage["browser_notif_enabled"]`
- [x] 3.5 `notifyDueToday` skips notifications when toggle is OFF
- [x] 3.6 Toggle state persists across page refresh
- [x] 3.7 First grant auto-enables the toggle

### Phase 4: Translations

#### Automated

- [x] 4.1 `npm run lint` passes (next-intl missing-key check)
- [x] 4.2 TypeScript compilation passes

#### Manual

- [x] 4.3 Toggle labels render correctly in EN, PL, and DE
