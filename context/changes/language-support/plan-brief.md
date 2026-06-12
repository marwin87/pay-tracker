# Language Support — Plan Brief

> Full plan: `context/changes/language-support/plan.md`

## What & Why

Add English and Polish language support to Pay Tracker (FR-016, FR-017). The UI currently has all strings hardcoded in English with no i18n infrastructure. The feature introduces a language toggle in the dashboard nav, browser-detected default, and per-user persistence so the chosen language is restored automatically after login.

## Starting Point

Zero i18n infrastructure exists today. ~80 user-visible strings are hardcoded across 13 files. The `User` model has no language field, and there is no `/auth/me` endpoint to read or update user preferences.

## Desired End State

Users see the app in their browser's language (Polish or English) on first visit. After login, their saved preference is applied automatically. A toggle in the dashboard header switches languages instantly and saves the choice to their account. All screens — auth forms, dashboard, bill management — are fully translated in both languages.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| i18n library | next-intl | Purpose-built for Next.js App Router; cleanest `useTranslations()` integration | Plan |
| Locale routing | No URL prefix | Auth-gated household app doesn't need bookmarkable locale URLs | Plan |
| Language toggle placement | Dashboard nav (beside ThemeToggle) | Visible at all times without navigating away; matches existing ThemeToggle pattern | Plan |
| Default language | Browser/OS detection (`navigator.language`) | Zero first-login friction; correct for both Polish and English households | User |
| Persistence | Backend DB column + `GET/PATCH /auth/me` | Satisfies FR-017 (per-account, cross-device persistence) | User |
| Translation scope | All screens at once | App is small enough; partial translation looks broken | User |
| Message loading | Static imports (both locales bundled) | ~5–10 KB overhead; avoids dynamic import complexity for a small string set | Plan |
| Pre-auth language | Browser detection on unauthenticated pages | Consistent with the logged-in detection logic | User |

## Scope

**In scope:**
- `language_preference` column on `users` + Alembic migration
- `GET /auth/me` and `PATCH /auth/me` backend endpoints
- `next-intl` install + `messages/en.json` + `messages/pl.json`
- `LocaleProvider` context (browser detection + backend sync)
- `useTranslations()` wired into all 13 files with user-visible strings
- `LanguageToggle` component in dashboard nav

**Out of scope:**
- URL-prefixed locale routing
- Third language
- Language field on the registration form
- Server-component translation (next-intl middleware/request config)

## Architecture / Approach

`LocaleProvider` (client component) wraps the app inside `AuthProvider`. It statically imports both message objects and passes the active one to `NextIntlClientProvider`. On auth state change, it calls `GET /auth/me` to load the saved preference; otherwise it reads `navigator.language`. `setLocale()` updates context state synchronously and fires `PATCH /auth/me` in the background. The `LanguageToggle` component consumes `useLocale()` — no state of its own.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend — User Language Preference | `language_preference` column, migration, `GET/PATCH /auth/me` | Migration must be copied from container to host |
| 2. Frontend i18n Infrastructure | next-intl installed, message files, `LocaleProvider`, root layout wiring | next-intl version compatibility with Next.js 16 |
| 3. Replace Hardcoded Strings | All ~80 strings replaced with `t()` calls in 13 files | Missing keys cause runtime errors — message files must be complete before this phase |
| 4. Language Switcher UI | `LanguageToggle` in nav, end-to-end flow verified | Preference must round-trip correctly through backend |

**Prerequisites:** Docker running (for migration generation), `frontend/` dev environment working.
**Estimated effort:** ~3–4 focused sessions across 4 phases.

## Open Risks & Assumptions

- `next-intl` v3+ is assumed — confirm the latest version supports Next.js 16.2.x before installing.
- `navigator.language` is `undefined` during SSR — the detection helper must guard with `typeof navigator === "undefined"` check.
- The `html lang` attribute is only updated client-side (via `document.documentElement.lang`) — the SSR default stays `"en"`.

## Success Criteria (Summary)

- Switching language via the nav toggle immediately changes all UI strings between English and Polish.
- The chosen language is restored automatically on the next login, across different browsers/devices.
- All pages — login, register, dashboard, bills, archived — are fully translated in both languages with no English leakage in Polish mode.
