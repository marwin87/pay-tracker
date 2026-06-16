# Notification Toggles — Plan Brief

> Full plan: `context/changes/notification-toggles/plan.md`

## What & Why

Add a master on/off switch to the Email Notifications tile and a user-preference switch to the Browser Notifications tile. Both tiles currently expose timing/permission controls but no way for the user to globally disable a notification channel without navigating away or unchecking individual options.

## Starting Point

`email_reminders_enabled` already exists in `UserProfile` and is accepted by `updateMe()` — the backend requires no changes. `BrowserNotificationsTile` is thin (permission state only); `useNotifications` has no `isEnabled`/`setEnabled`. No `Switch` UI primitive exists in the project.

## Desired End State

Email tile: pill toggle at the top dims/blocks all child controls when off, participates in dirty/save/cancel, and is reflected immediately in the "Send Now" disabled condition. Browser tile when permission is granted: shows the OS permission indicator plus a user-preference toggle backed by `localStorage["browser_notif_enabled"]`; `notifyDueToday` respects that preference.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Toggle UI primitive | New `Switch` component (`components/ui/Switch.tsx`) | Two tiles need it; reusable component avoids duplicated Tailwind peer-* boilerplate |
| Email children when OFF | `opacity-50 pointer-events-none` wrapper div | Matches "dim/disable" spec; toggle itself stays outside the wrapper |
| Browser tile layout when granted | Keep green indicator + add toggle below it | User needs to see both OS permission state and their own preference |
| Browser preference storage | `localStorage["browser_notif_enabled"]` | Client-only preference; no dirty/save cycle needed |
| Translation text | "Enable email notifications" / "Enable browser notifications" | Consistent with existing button labels in each tile |

## Scope

**In scope:**
- `Switch` component
- `emailEnabled` local state + dirty/save/cancel/send-now wiring in `EmailNotificationsTile`
- `isEnabled`/`setEnabled` in `useNotifications` hook
- `BrowserNotificationsTile` layout update
- 2 new keys × 3 locale files (6 strings)

**Out of scope:**
- Backend changes (field already exists)
- `NotificationToggle.tsx` or `EmailRemindersToggle.tsx` header components
- Service worker or notification payload changes

## Architecture / Approach

`Switch.tsx` is a pure presentational component. Email tile extends its existing state machine with one new variable (`emailEnabled`). Browser toggle is managed entirely inside the hook via a localStorage key — no profile sync, no dirty cycle. The hook's return type gains two fields; `BrowserNotificationsTile` destructures them.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Shared Switch | Reusable pill toggle component | Tailwind peer-* requires correct HTML nesting — test visually |
| 2. Email master toggle | Master toggle wired into email tile | isDirty, cancel, save, and Send Now all need to change atomically |
| 3. Browser toggle | Hook extension + tile layout update | First-grant auto-enable and localStorage default logic edge cases |
| 4. Translations | 6 new strings across 3 locales | next-intl will surface missing keys at build time — catches typos |

**Prerequisites:** None — no migration, no backend deploy, no dependency install required.  
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- `useNotifications` is called both in `BrowserNotificationsTile` (settings) and `NotificationToggle.tsx` (header). The header component calls `notifyDueToday()` on mount — once `isEnabled` is added, the hook instance in the header will also respect it. This is the desired behavior; no extra wiring needed.
- `getInitialEnabled()` reads `Notification.permission` synchronously on hook init — this is safe but means the initial render on SSR will always see `false` (notificationsSupported is false server-side). This is already true of the existing permission check and causes no hydration issues.

## Success Criteria (Summary)

- Email master toggle saves `email_reminders_enabled` to the profile and dims children when off
- Browser toggle persists to localStorage and suppresses `notifyDueToday` when off
- All toggle labels render in EN, PL, and DE
