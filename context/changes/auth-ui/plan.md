# Auth UI Implementation Plan

## Overview

Build the authentication UI layer for the pay-tracker Next.js frontend: login page, register page, cookie-based JWT storage, AuthContext, Next.js middleware route guard, and a minimal dashboard stub. The FastAPI backend (JWT auth routes, User model, route protection) is already complete. This is frontend-only work on a clean slate.

## Current State Analysis

**Backend — complete:**
- `POST /auth/register` (`backend/app/routers/auth.py:12`) — email + password → JWT
- `POST /auth/login` (`backend/app/routers/auth.py:23`) — email + password → JWT
- `TokenResponse` schema returns `{ access_token, token_type: "bearer" }` (`backend/app/schemas/auth.py`)
- All protected routes use `current_user` dependency (`backend/app/core/deps.py:13`)

**Frontend — greenfield:**
- Root layout exists (`frontend/src/app/layout.tsx`) — sets up Geist fonts, Tailwind
- Single home page at `/` (`frontend/src/app/page.tsx`) — Next.js boilerplate, needs replacement
- No components directory, no API client, no auth pages, no token storage
- Stack: Next.js 16, React 19, Tailwind v4 — zero third-party UI libraries

**Known blockers:**
- CORS: backend allows `http://localhost:3000` only (`backend/app/main.py:10`); frontend runs on port `3010`
- `frontend/AGENTS.md` warns Next.js 16 has breaking changes from training data — read node_modules docs before any frontend code

## Desired End State

A user can open the app, register with email + password, and log in. The JWT is stored in a plain JS-readable cookie. Authenticated users land on `/dashboard`; unauthenticated users are redirected to `/login` by Next.js middleware. Logging out clears the cookie and redirects to `/login`. The `/login` and `/register` pages redirect already-authenticated users to `/dashboard`.

Verify: `docker compose up --build`, open `http://localhost:3010`, complete register → login → logout cycle without errors; protected routes redirect to `/login` when not authenticated.

### Key Discoveries

- CORS allows `localhost:3000` only — must add `3010` before any API call will succeed (`backend/app/main.py:10`)
- `middleware.ts` at the Next.js root can read cookies but not localStorage — drove the cookie-based token storage decision
- Backend returns 400 `"Email already registered"` and 401 `"Invalid credentials"` as JSON `{ detail: "..." }` — frontend must read `response.json().detail`
- Tailwind v4 uses `@import "tailwindcss"` syntax (not the older config.js `content:[]` pattern) — follow `globals.css` conventions
- All auth pages need `"use client"` — they handle form state and submission

## What We're NOT Doing

- No httpOnly cookie (backend Set-Cookie) — would require backend changes and CSRF handling
- No global component library (Button, Input as shared `src/components/ui/`) — form elements built inline in auth pages for this slice
- No toast notification library — inline form error messages only
- No password strength meter — minimum 8-character client-side check only
- No CLOUD/Supabase auth — LOCAL JWT only; Supabase deferred to a later slice
- No email verification, password reset, or "remember me" flows
- No React Hook Form or any form library

## Implementation Approach

Build in three phases: (1) infrastructure — fix CORS, token utility, API client, AuthContext, middleware; (2) auth pages — login and register with forms, inline errors, redirects; (3) dashboard stub — protected page with logout, validating the full session lifecycle.

Token is stored in a plain JS-readable cookie (name: `auth_token`). Middleware reads it to redirect unauthenticated/authenticated users at the edge. The API fetch wrapper reads the same cookie for `Authorization: Bearer` headers. AuthContext provides `user`, `login()`, `logout()` to components.

## Critical Implementation Details

**Cookie vs middleware compatibility**: `middleware.ts` runs in the Next.js Edge Runtime and reads cookies via `request.cookies.get('auth_token')`. The same cookie must be set from client-side JS on login as `document.cookie = "auth_token=<jwt>; path=/; SameSite=Lax"` and cleared on logout as `document.cookie = "auth_token=; path=/; max-age=0"`. Do not use `HttpOnly` or `Secure` flags — the API client needs to read the value from JS.

**Next.js 16 `"use client"` placement**: In Next.js 16 App Router, `"use client"` must be the very first line of the file (before imports). Auth pages and AuthContext provider are Client Components. The root `layout.tsx` can remain a Server Component — wrap only the subtree that needs auth context.

---

## Phase 1: Auth Infrastructure

### Overview

Fix CORS, create the cookie-based token utility and API fetch wrapper, wire up AuthContext + useAuth hook, and add Next.js middleware for route guards. No visible UI in this phase — these are the primitives everything else builds on.

### Changes Required

#### 1. Fix CORS allowed origins

**File**: `backend/app/main.py`

**Intent**: Add `http://localhost:3010` to the CORS `allow_origins` list so the frontend can reach the backend. Without this, every API call from the browser will fail with a CORS error.

**Contract**: The `CORSMiddleware` call gains a second origin in its list. Keep `http://localhost:3000` to avoid breaking anything using that port.

#### 2. Token cookie utility

**File**: `frontend/src/lib/auth.ts`

**Intent**: Centralise cookie read/write/clear so the API client, login/logout logic, and middleware all use one source of truth for the `auth_token` cookie.

**Contract**: Export three functions — `getAuthToken(): string | null`, `setAuthToken(token: string): void`, `clearAuthToken(): void`. Use plain `document.cookie` (no library). Cookie name: `auth_token`, path `/`, `SameSite=Lax`. Do NOT set `HttpOnly` or `Secure`.

#### 3. API fetch wrapper

**File**: `frontend/src/lib/api.ts`

**Intent**: Provide a typed fetch helper that automatically attaches `Authorization: Bearer <token>` from the cookie and parses JSON responses, so every call site doesn't repeat this boilerplate.

**Contract**: Export `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`. Base URL is `http://localhost:8010`. Reads token via `getAuthToken()`. Throws on non-2xx responses with the error body's `detail` field as the message. No retry logic.

#### 4. AuthContext and useAuth hook

**File**: `frontend/src/context/auth-context.tsx`

**Intent**: Provide a React context that holds the auth state (is the user logged in, what's their email) and exposes `login()` and `logout()` actions so any component can read or change auth state without prop-drilling.

**Contract**:
- `AuthProvider` — wraps children; reads `auth_token` cookie on mount to set initial `isAuthenticated` state; no JWT decode needed, presence of the cookie is sufficient for UI state
- `useAuth()` — returns `{ isAuthenticated: boolean, login(token: string): void, logout(): void }`
- `login(token)` calls `setAuthToken(token)` and updates state
- `logout()` calls `clearAuthToken()`, updates state, and calls `router.push('/login')`
- Mark file `"use client"` — first line

#### 5. Wrap root layout with AuthProvider

**File**: `frontend/src/app/layout.tsx`

**Intent**: Mount `AuthProvider` at the root so all pages and components can call `useAuth()`.

**Contract**: Import and wrap `{children}` with `<AuthProvider>`. Root layout remains a Server Component outer shell; `AuthProvider` is the Client Component subtree entry point.

#### 6. Next.js middleware route guard

**File**: `frontend/middleware.ts` (project root, sibling of `package.json`)

**Intent**: Intercept all requests at the edge; redirect unauthenticated users attempting to reach protected routes to `/login`, and redirect authenticated users attempting to reach `/login` or `/register` to `/dashboard`.

**Contract**:
- Protected routes matcher: any path NOT starting with `/login`, `/register`, or `/_next` or `/favicon`
- Read `request.cookies.get('auth_token')` — if absent, redirect to `/login`
- If route IS `/login` or `/register` and cookie IS present, redirect to `/dashboard`
- Export a `config` with `matcher` to limit middleware scope to app routes only

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes with no errors
- TypeScript compiles: `cd frontend && npx tsc --noEmit`
- Backend container starts cleanly with updated CORS

#### Manual Verification

- `curl -X POST http://localhost:8010/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"test"}' -v` returns 401 (not a CORS error) confirming backend is reachable from port 3010
- Visiting `http://localhost:3010/dashboard` in the browser (with no cookie) redirects to `/login`
- Visiting `http://localhost:3010/login` with a valid `auth_token` cookie set in DevTools redirects to `/dashboard`

**Implementation Note**: After completing Phase 1 and automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Auth Pages

### Overview

Build the `/login` and `/register` pages with forms, inline error messages, client-side validation, loading states, and post-auth redirects.

### Changes Required

#### 1. Login page

**File**: `frontend/src/app/login/page.tsx`

**Intent**: Render an email + password form that calls `POST /auth/login`, stores the returned JWT via `useAuth().login()`, and redirects to `/dashboard` on success. Displays backend error messages inline below the form.

**Contract**:
- `"use client"` — first line
- Form fields: `<input type="email">` and `<input type="password">` with `required`
- Submit handler: calls `apiFetch<TokenResponse>('/auth/login', { method: 'POST', body: ... })`
- On success: `login(token)` then `router.push('/dashboard')`
- On error: set an `error: string | null` state, display below the submit button as red text
- Loading state: disable submit button and show "Logging in…" text while request is in flight
- Link to `/register` for new users
- No shared Button/Input components — use Tailwind directly on `<button>` and `<input>` elements

#### 2. Register page

**File**: `frontend/src/app/register/page.tsx`

**Intent**: Render an email + password form that validates password length client-side, calls `POST /auth/register`, stores the JWT, and redirects to `/dashboard` on success.

**Contract**:
- Same structure as login page
- Client-side validation before submit: password must be ≥ 8 characters; if not, set inline error `"Password must be at least 8 characters"` without calling the API
- Submit handler: calls `apiFetch<TokenResponse>('/auth/register', { method: 'POST', body: ... })`
- On success: `login(token)` then `router.push('/dashboard')`
- On error: display `error.detail` inline
- Link to `/login` for existing users

#### 3. Replace home page

**File**: `frontend/src/app/page.tsx`

**Intent**: The current Next.js boilerplate at `/` has no role in the app. Replace it with a minimal redirect — unauthenticated users go to `/login`, authenticated users go to `/dashboard`. Middleware will handle most cases, but the page itself should not render the boilerplate.

**Contract**: A Server Component that returns `redirect('/login')` from `next/navigation`. Middleware will intercept authenticated users before this page renders, so this is a fallback.

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes
- TypeScript compiles: `cd frontend && npx tsc --noEmit`

#### Manual Verification

- Register flow: fill form with new email + password ≥ 8 chars → submitted → lands on `/dashboard`
- Register duplicate: same email again → inline error "Email already registered" appears
- Register short password: password < 8 chars → submit blocked, inline error shown without API call
- Login flow: valid credentials → lands on `/dashboard`
- Login bad credentials: wrong password → inline error "Invalid credentials" appears
- Loading state: button text changes and is disabled during submission
- Already-logged-in: visiting `/login` with valid cookie → redirected to `/dashboard`

**Implementation Note**: After completing Phase 2 and automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Dashboard Stub & Session Lifecycle

### Overview

Create the minimal `/dashboard` page that proves the protected-route pattern works end-to-end. It shows a welcome message and a logout button that clears the auth cookie and redirects to `/login`.

### Changes Required

#### 1. Dashboard page

**File**: `frontend/src/app/dashboard/page.tsx`

**Intent**: Act as the post-login landing page and validate the full session lifecycle — the page is reachable only when authenticated (middleware enforces this), and it provides a logout action.

**Contract**:
- `"use client"` — first line
- Display: "Pay Tracker" heading + "You are logged in." + a Logout button
- Logout button click: calls `useAuth().logout()` which clears cookie and pushes `/login`
- No data fetching in this stub — that's for future slices

### Success Criteria

#### Automated Verification

- `cd frontend && npm run lint` passes
- TypeScript compiles: `cd frontend && npx tsc --noEmit`
- `docker compose up --build` starts without errors

#### Manual Verification

- Full cycle: register → `/dashboard` → logout → `/login` → login → `/dashboard` — all redirects work
- Direct navigation: visit `http://localhost:3010/dashboard` with no cookie → redirected to `/login`
- After logout: cookie is absent in browser DevTools → visiting `/dashboard` redirects to `/login`
- No console errors or TypeScript errors in browser DevTools during the full cycle

**Implementation Note**: After completing Phase 3 and all automated verification passes, pause for manual confirmation that the full cycle works before considering this change complete.

---

## Testing Strategy

### Unit Tests

- Not in scope for this slice — UI auth flows are validated manually; unit tests are a future slice concern

### Integration Tests

- Not in scope — backend auth endpoints are already tested via FastAPI's own test suite

### Manual Testing Steps

1. `docker compose up --build` — confirm clean start
2. Open `http://localhost:3010` — should redirect to `/login`
3. Register with `test@example.com` / `password123` — lands on `/dashboard`
4. Logout — redirects to `/login`
5. Login with same credentials — lands on `/dashboard`
6. Open a new tab, navigate to `http://localhost:3010/dashboard` — should stay on `/dashboard` (cookie present)
7. In DevTools → Application → Cookies: clear `auth_token`; refresh `/dashboard` — should redirect to `/login`
8. Visit `http://localhost:3010/login` while cookie is set — should redirect to `/dashboard`

## Performance Considerations

No special concerns. Auth pages are lightweight; cookie reads are synchronous. Middleware adds negligible latency.

## Migration Notes

No data migrations. The `users` table already exists and is schema-complete. Any existing test users in the database are unaffected.

## References

- Backend auth routes: `backend/app/routers/auth.py`
- Backend CORS config: `backend/app/main.py:10`
- Backend auth schemas: `backend/app/schemas/auth.py`
- Frontend AGENTS.md warning: `frontend/AGENTS.md`
- PRD: `context/foundation/prd.md` (FR-001, FR-002)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth Infrastructure

#### Automated

- [x] 1.1 `cd frontend && npm run lint` passes with no errors
- [x] 1.2 TypeScript compiles: `cd frontend && npx tsc --noEmit`
- [x] 1.3 Backend container starts cleanly with updated CORS

#### Manual

- [x] 1.4 `curl POST /auth/login` from port 3010 returns 401 (not CORS error)
- [x] 1.5 Visiting `/dashboard` with no cookie redirects to `/login`
- [x] 1.6 Visiting `/login` with valid `auth_token` cookie redirects to `/dashboard`

### Phase 2: Auth Pages

#### Automated

- [x] 2.1 `cd frontend && npm run lint` passes
- [x] 2.2 TypeScript compiles: `cd frontend && npx tsc --noEmit`

#### Manual

- [x] 2.3 Register with new email + password ≥ 8 chars lands on `/dashboard`
- [x] 2.4 Register duplicate email shows inline error "Email already registered"
- [x] 2.5 Register with password < 8 chars shows inline error without API call
- [x] 2.6 Login with valid credentials lands on `/dashboard`
- [x] 2.7 Login with wrong password shows inline error "Invalid credentials"
- [x] 2.8 Submit button disabled and shows loading text during submission
- [x] 2.9 Visiting `/login` with valid cookie redirects to `/dashboard`

### Phase 3: Dashboard Stub & Session Lifecycle

#### Automated

- [x] 3.1 `cd frontend && npm run lint` passes
- [x] 3.2 TypeScript compiles: `cd frontend && npx tsc --noEmit`
- [x] 3.3 `docker compose up --build` starts without errors

#### Manual

- [x] 3.4 Full cycle: register → `/dashboard` → logout → `/login` → login → `/dashboard`
- [x] 3.5 Direct navigation to `/dashboard` with no cookie redirects to `/login`
- [x] 3.6 After logout, `auth_token` cookie absent in DevTools
- [x] 3.7 No console errors in browser DevTools during full cycle
