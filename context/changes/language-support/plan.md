# Language Support Implementation Plan

## Overview

Add English and Polish UI support to Pay Tracker. Language is detected from the browser on first use, persisted per user account in the database, and changeable via a toggle in the dashboard navigation bar. Implemented with `next-intl` (client-only, no URL routing).

## Current State Analysis

- No i18n library installed. All ~80 user-visible strings are hardcoded in English across 13 files.
- `User` model has no language preference field. No `/auth/me` endpoint exists.
- Root layout has `lang="en"` hardcoded. `next.config.ts` has no i18n config.
- `AuthProvider` wraps the root layout and exposes `isAuthenticated` — the `LocaleProvider` will sit inside it and react to auth state.
- Alembic manages schema migrations; the migration must be generated and committed.

## Desired End State

Users see the app in their browser's detected language (Polish or English) on first visit. After login, the previously saved preference is applied automatically. A language toggle in the dashboard nav bar allows switching at any time, with the choice persisted to the user's account. Both English and Polish cover all user-visible strings across every screen.

### Key Discoveries

- `frontend/src/app/layout.tsx:40` — `AuthProvider` is the sole wrapper; `LocaleProvider` nests inside it so `useAuth()` is available.
- `frontend/src/app/dashboard/layout.tsx:66-75` — `ThemeToggle` and logout button sit in the same `div`; `LanguageToggle` goes alongside `ThemeToggle` here.
- `backend/app/routers/auth.py` — auth router at prefix `/auth`; `GET/PATCH /auth/me` are added here.
- `backend/app/core/deps.py` — `current_user` dependency is already wired; both new endpoints reuse it.
- Both message files are statically imported at build time — bundle overhead is negligible (~5–10 KB total for ~80 strings).

## What We're NOT Doing

- No URL-prefixed locale routing (`/pl/…`, `/en/…`) — unnecessary for an auth-gated household app.
- No server-component translation (next-intl middleware/request config) — client-only usage is sufficient.
- No third language in this change — additional locales are a future extension.
- No language setting on the login/register pages themselves (beyond browser detection).
- No language field on the registration form — preference is detected automatically; users change it after login.

## Implementation Approach

Backend adds a nullable `language_preference` column to `users` and two REST endpoints (`GET/PATCH /auth/me`). Frontend installs `next-intl`, extracts all strings into `messages/en.json` + `messages/pl.json`, and introduces a `LocaleProvider` that sits inside `AuthProvider`. On mount, if authenticated, it fetches `/auth/me` and applies the saved preference; otherwise it falls back to `navigator.language`. When the user changes language via the nav toggle, `PATCH /auth/me` is called and the provider's state is updated synchronously.

## Critical Implementation Details

**Provider nesting order**: `AuthProvider` → `LocaleProvider` → `NextIntlClientProvider` → children. `LocaleProvider` must be inside `AuthProvider` to call `useAuth()`; `NextIntlClientProvider` must wrap all translated components.

**`html lang` attribute**: The root layout sets `lang="en"` as a server-rendered default. `LocaleProvider` updates `document.documentElement.lang` in a `useEffect` whenever `locale` changes — this is the only safe way to sync it client-side without URL routing.

**Static message imports**: Import both `en.json` and `pl.json` at the top of `locale-context.tsx`. Passing the right object to `NextIntlClientProvider` based on `locale` state avoids dynamic imports and keeps the implementation simple.

---

## Phase 1: Backend — User Language Preference

### Overview

Extend the `User` model with a nullable `language_preference` column, generate the Alembic migration, add `UserProfileOut` / `UserProfileUpdate` schemas, and expose `GET /auth/me` + `PATCH /auth/me` endpoints on the existing auth router.

### Changes Required

#### 1. User model

**File**: `backend/app/models/user.py`

**Intent**: Add `language_preference` as a nullable `String(5)` column so each user can store their chosen locale code (`"en"` or `"pl"`). Nullable means "not yet set" — the frontend treats `null` as "fall back to browser detection".

**Contract**: New column: `language_preference: Mapped[str | None] = mapped_column(String(5), nullable=True, default=None)`. Placed after `is_active`.

#### 2. Alembic migration

**File**: `backend/alembic/versions/<hash>_add_language_preference_to_users.py` (generated)

**Intent**: Create the migration that adds the new nullable column. Generate it inside the running container (`docker compose exec backend uv run alembic revision --autogenerate -m "add_language_preference_to_users"`), then copy it to the host with `docker compose cp`.

**Contract**: Migration adds `language_preference VARCHAR(5)` to `users`, nullable, no server default.

#### 3. Auth schemas

**File**: `backend/app/schemas/auth.py`

**Intent**: Add two new schemas for the `/auth/me` endpoints — one for reading the profile and one for updating it.

**Contract**:
- `UserProfileOut(BaseModel)` with fields: `email: EmailStr`, `language_preference: str | None`. `model_config = {"from_attributes": True}`.
- `UserProfileUpdate(BaseModel)` with field: `language_preference: str | None = None`.

#### 4. Auth router — `/auth/me` endpoints

**File**: `backend/app/routers/auth.py`

**Intent**: Add `GET /auth/me` to return the current user's profile and `PATCH /auth/me` to update the language preference. Both are authenticated via the existing `current_user` dependency.

**Contract**:
- `GET /auth/me` → `response_model=UserProfileOut`, returns `current_user` directly (SQLAlchemy object maps via `from_attributes`).
- `PATCH /auth/me` → accepts `UserProfileUpdate` body; sets `language_preference` on the user if the value is provided (non-`None` check via `exclude_unset`); commits and refreshes; returns `UserProfileOut`.

### Success Criteria

#### Automated Verification

- Migration generates cleanly: `docker compose exec backend uv run alembic revision --autogenerate -m "add_language_preference_to_users"` — no unexpected diffs
- Migration applies: `docker compose exec backend uv run alembic upgrade head`
- Backend starts without errors: `docker compose up --build backend`
- Lint passes: `docker compose exec backend uv run ruff check app/` (if ruff is configured) or equivalent

#### Manual Verification

- `GET /auth/me` (authenticated) returns `{"email": "...", "language_preference": null}` for an existing user
- `PATCH /auth/me` with `{"language_preference": "pl"}` returns the updated profile
- `GET /auth/me` after the patch returns `"language_preference": "pl"`
- Unauthenticated `GET /auth/me` returns 401

**Implementation Note**: After completing this phase and manual verification, pause for human confirmation before proceeding.

---

## Phase 2: Frontend i18n Infrastructure

### Overview

Install `next-intl`, create both message files with all user-visible strings, build the `LocaleProvider` context, and wire it into the root layout.

### Changes Required

#### 1. Install next-intl

**File**: `frontend/package.json`

**Intent**: Add `next-intl` as a production dependency.

**Contract**: `npm install next-intl` in `frontend/`. No changes to `next.config.ts` — client-only usage requires no plugin or middleware.

#### 2. User API helper

**File**: `frontend/src/lib/user-api.ts` (new file)

**Intent**: Provide typed `fetchMe()` and `updateMe()` functions that call `GET /auth/me` and `PATCH /auth/me`. These are used by `LocaleProvider` and `LanguageToggle`.

**Contract**:
```ts
export interface UserProfile {
  email: string;
  language_preference: "en" | "pl" | null;
}
export function fetchMe(): Promise<UserProfile>
export function updateMe(data: { language_preference: string }): Promise<UserProfile>
```
Both use the shared `apiFetch` from `@/lib/api` (same pattern as `bills-api.ts`).

#### 3. Message files

**Files**: `frontend/messages/en.json` and `frontend/messages/pl.json` (new files)

**Intent**: Hold all user-visible strings organised by component namespace. Every string currently hardcoded in the 13 files listed below gets a key here.

**Contract**: Top-level namespace keys match component/page names:
`Auth`, `Dashboard`, `DashboardLayout`, `BillsPage`, `ArchivedBillsPage`, `BillTemplateForm`, `BillTemplateRow`, `ArchiveConfirmDialog`, `CategoryCombobox`, `ThemeToggle`, `LanguageToggle`.

Both files must have identical key structures; values differ by language.

#### 4. Locale context

**File**: `frontend/src/context/locale-context.tsx` (new file)

**Intent**: Manage locale state for the app. On mount when authenticated, fetch `/auth/me` and apply the saved preference; otherwise detect from `navigator.language`. Wrap children with `NextIntlClientProvider`. Export `useLocale()` hook for `LanguageToggle` to consume.

**Contract**:
- Type `Locale = "en" | "pl"`.
- Detection helper: `navigator.language.startsWith("pl") ? "pl" : "en"`.
- `LocaleProvider` calls `useAuth()` (safe — it's nested inside `AuthProvider`).
- `useEffect` on `isAuthenticated`: when true, calls `fetchMe()` and applies `language_preference` if non-null.
- Second `useEffect` on `locale`: sets `document.documentElement.lang = locale`.
- Context value: `{ locale: Locale; setLocale: (l: Locale) => void }`. `setLocale` updates state and (when authenticated) calls `updateMe`.
- Renders: `<NextIntlClientProvider locale={locale} messages={messagesMap[locale]}>`.
- Static import: `import enMessages from "../../messages/en.json"` and `import plMessages from "../../messages/pl.json"` at the top of the file; `const messagesMap = { en: enMessages, pl: plMessages }`.

#### 5. Root layout — wire LocaleProvider

**File**: `frontend/src/app/layout.tsx`

**Intent**: Nest `LocaleProvider` inside `AuthProvider` so the locale context is available to all pages.

**Contract**: Wrapping order: `<AuthProvider><LocaleProvider>{children}</LocaleProvider></AuthProvider>`. The `lang="en"` attribute on `<html>` stays as the SSR default; `LocaleProvider`'s effect updates it client-side.

### Success Criteria

#### Automated Verification

- `npm install` completes without errors
- `npm run lint` passes
- TypeScript: `npx tsc --noEmit` passes (no type errors in new files)
- Both message files are valid JSON with matching key structures

#### Manual Verification

- App loads without console errors
- `document.documentElement.lang` reflects `"pl"` when browser language is Polish
- `useTranslations()` does not throw when called inside a component wrapped by `NextIntlClientProvider`

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation before proceeding.

---

## Phase 3: Replace Hardcoded Strings

### Overview

Replace every hardcoded user-visible string in all 13 files with `useTranslations()` calls. The message files from Phase 2 are the source of truth for key names.

### Changes Required

#### Files to migrate (all use `useTranslations("<Namespace>")`)

| File | Namespace |
|------|-----------|
| `frontend/src/app/layout.tsx` | `App` (metadata only — title/description via `Metadata` object) |
| `frontend/src/app/login/page.tsx` | `Auth` |
| `frontend/src/app/register/page.tsx` | `Auth` |
| `frontend/src/app/dashboard/layout.tsx` | `DashboardLayout` |
| `frontend/src/app/dashboard/page.tsx` | `Dashboard` |
| `frontend/src/app/dashboard/bills/page.tsx` | `BillsPage` |
| `frontend/src/app/dashboard/bills/archived/page.tsx` | `ArchivedBillsPage` |
| `frontend/src/components/bills/BillTemplateForm.tsx` | `BillTemplateForm` |
| `frontend/src/components/bills/BillTemplateRow.tsx` | `BillTemplateRow` |
| `frontend/src/components/bills/ArchiveConfirmDialog.tsx` | `ArchiveConfirmDialog` |
| `frontend/src/components/bills/CategoryCombobox.tsx` | `CategoryCombobox` |
| `frontend/src/components/ThemeToggle.tsx` | `ThemeToggle` |

**Intent per file**: Replace every string literal that a user reads (labels, headings, button text, placeholder text, error messages, aria-labels, empty-state copy) with `t("keyName")`. The `FREQUENCY_LABEL` maps in `BillTemplateForm`, `BillTemplateRow`, and `ArchivedBillsPage` become translation keys (e.g. `t("frequency.monthly")`).

**Contract**: Each file adds `const t = useTranslations("<Namespace>")` at the top of its component function. String literals are replaced with `t("key")` calls. Key names must exactly match those in the message files from Phase 2.

### Success Criteria

#### Automated Verification

- `npm run lint` passes across all modified files
- `npx tsc --noEmit` — no type errors

#### Manual Verification

- Entire app renders in English with no visible untranslated keys or errors
- Switch locale to Polish (temporarily hardcode `"pl"` in `LocaleProvider` state init) — all strings appear in Polish, no English strings leak through
- Revert hardcode; browser detection works as expected

**Implementation Note**: Pause after this phase for manual confirmation before proceeding.

---

## Phase 4: Language Switcher UI

### Overview

Build the `LanguageToggle` component, add it to the dashboard nav bar alongside `ThemeToggle`, and connect it to `LocaleContext` so changing language persists to the backend.

### Changes Required

#### 1. LanguageToggle component

**File**: `frontend/src/components/LanguageToggle.tsx` (new file)

**Intent**: A button that shows the current locale code (`EN` / `PL`) and toggles between the two. Calls `setLocale()` from `useLocale()` on click — the context handles backend persistence.

**Contract**: Renders a `<button>` with `aria-label` from `useTranslations("LanguageToggle")`. Shows current locale as uppercase label. Styled to match `ThemeToggle` (same `rounded-lg px-3 py-1.5 text-sm font-medium` pattern). No local state — driven entirely by `useLocale()`.

#### 2. Dashboard layout — add LanguageToggle

**File**: `frontend/src/app/dashboard/layout.tsx`

**Intent**: Place `LanguageToggle` in the right-side header group next to `ThemeToggle`.

**Contract**: In the `{/* Right side */}` div, add `<LanguageToggle />` immediately before `<ThemeToggle />`. Import from `@/components/LanguageToggle`.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npx tsc --noEmit` passes

#### Manual Verification

- Language toggle appears in the dashboard header next to the theme toggle
- Clicking the toggle switches all strings in the UI between English and Polish immediately
- After switching to Polish and refreshing, the app loads in Polish (preference was saved to backend)
- On a new browser (different session), after logging in, the Polish preference is restored from `/auth/me`
- Unauthenticated pages (login, register) use browser language detection

**Implementation Note**: Pause after this phase for final human acceptance testing.

---

## Testing Strategy

### Manual Testing Steps

1. Open app in a browser set to Polish (or set `navigator.language` via devtools override) — login page should be in Polish.
2. Log in — app loads in Polish immediately (browser-detected).
3. Click the language toggle — all strings switch to English.
4. Refresh — English is restored (saved to backend).
5. Log out, log in from a different browser tab — English preference is applied from `/auth/me`.
6. Open `/auth/me` in API docs — verify `language_preference: "en"`.
7. Switch back to Polish via toggle; verify `/auth/me` returns `"pl"`.

## Migration Notes

Existing users will have `language_preference = null` after the migration. The `LocaleProvider` falls back to browser detection for null, so existing sessions are unaffected — no data backfill needed.

## References

- PRD FR-016, FR-017: `context/foundation/prd.md`
- next-intl without routing docs: `https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing`
- Existing ThemeToggle pattern: `frontend/src/components/ThemeToggle.tsx`
- Auth context: `frontend/src/context/auth-context.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — User Language Preference

#### Automated

- [x] 1.1 Migration generates cleanly (no unexpected diffs)
- [x] 1.2 Migration applies: `alembic upgrade head`
- [x] 1.3 Backend starts without errors after rebuild

#### Manual

- [x] 1.4 `GET /auth/me` returns `language_preference: null` for existing user
- [x] 1.5 `PATCH /auth/me` updates and returns the new preference
- [x] 1.6 Unauthenticated `GET /auth/me` returns 401

### Phase 2: Frontend i18n Infrastructure

#### Automated

- [x] 2.1 `npm install` completes without errors
- [x] 2.2 `npm run lint` passes
- [x] 2.3 `npx tsc --noEmit` passes

#### Manual

- [x] 2.4 App loads without console errors
- [x] 2.5 `document.documentElement.lang` reflects browser language
- [x] 2.6 `useTranslations()` does not throw in a test component

### Phase 3: Replace Hardcoded Strings

#### Automated

- [x] 3.1 `npm run lint` passes across all 13 modified files
- [x] 3.2 `npx tsc --noEmit` passes

#### Manual

- [x] 3.3 App renders fully in English with no missing keys
- [x] 3.4 Hardcoded `"pl"` in LocaleProvider shows all strings in Polish

### Phase 4: Language Switcher UI

#### Automated

- [x] 4.1 `npm run lint` passes
- [x] 4.2 `npx tsc --noEmit` passes

#### Manual

- [x] 4.3 Toggle appears in dashboard header alongside ThemeToggle
- [x] 4.4 Switching language updates all strings immediately
- [x] 4.5 Preference persists across page refresh
- [x] 4.6 Preference restored after login from a different session
