# Auth UI — Plan Brief

> Full plan: `context/changes/auth-ui/plan.md`

## What & Why

Build the authentication UI layer for the pay-tracker Next.js frontend. The FastAPI backend already has working JWT login and register endpoints — what's missing is everything on the browser side: the login and register pages, token storage, auth state management, and route guards. Users currently have no way to authenticate with the app.

## Starting Point

The frontend is a clean slate: a root layout, a boilerplate home page, and no components, no API client, no auth pages. Backend auth is production-ready at `POST /auth/register` and `POST /auth/login`, returning `{ access_token, token_type }`.

## Desired End State

A user opens the app, registers with email + password, and lands on `/dashboard`. Subsequent visits are gated by a Next.js middleware that reads an `auth_token` cookie — unauthenticated users are redirected to `/login`, authenticated users are redirected away from auth pages. Logging out clears the cookie and returns the user to `/login`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Token storage | Plain JS-readable cookie (`auth_token`) | Middleware runs server-side and can only read cookies, not localStorage |
| Auth state | React Context + `useAuth()` hook | Idiomatic React 19 pattern, no extra deps, works with Next.js App Router |
| Route guard | Next.js `middleware.ts` at edge | Single authoritative redirect with no flash of protected content |
| Error display | Inline form message | Simplest approach, no library needed, error shown in context |
| Password validation | Min 8 chars client-side only | Adequate for a personal household app; backend has no constraint either |
| Post-auth destination | `/dashboard` (stub page) | Validates the full auth flow end-to-end including logout |
| Component library | None (inline Tailwind) | Out of scope for this slice; avoids premature abstraction |
| CORS fix | Add `localhost:3010` to backend allowed origins | Backend currently only allows port 3000; frontend runs on 3010 |

## Scope

**In scope:**
- CORS fix in backend (`main.py`)
- `src/lib/auth.ts` — cookie read/write/clear
- `src/lib/api.ts` — fetch wrapper with Bearer token
- `src/context/auth-context.tsx` — AuthContext + useAuth hook
- `middleware.ts` — route guard (protected → /login; auth pages → /dashboard)
- `/login` page — form, inline errors, redirect
- `/register` page — form, min-length check, inline errors, redirect
- `/dashboard` page — stub with logout button
- Replace boilerplate `page.tsx` with redirect

**Out of scope:**
- httpOnly cookies / CSRF handling
- Supabase / CLOUD mode auth
- Password reset, email verification, "remember me"
- Shared UI component library (Button, Input)
- Toast notifications
- Unit or integration tests

## Architecture / Approach

Three phases: infrastructure → pages → session lifecycle. The `auth_token` cookie is the single source of truth: set on login/register, read by middleware for guards and by the API client for request headers, cleared on logout. AuthContext reads the cookie on mount for initial state; components use `useAuth()` to read and mutate auth state. All auth pages are Client Components (`"use client"`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Auth Infrastructure | CORS fix, cookie util, API client, AuthContext, middleware | Next.js 16 breaking changes (read docs before coding) |
| 2. Auth Pages | `/login` and `/register` with full form UX | Cookie-to-middleware integration works correctly |
| 3. Dashboard Stub | `/dashboard` with logout; full cycle validated | Middleware matcher config covers all edge cases |

**Prerequisites:** Backend running (`docker compose up`); `.env` with `JWT_SECRET` set
**Estimated effort:** ~1-2 sessions across 3 phases

## Open Risks & Assumptions

- Next.js 16 has breaking changes — `frontend/AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing frontend code; routing hooks or middleware API may differ from training data
- No password strength constraint exists on the backend — a user can register with a trivially weak password if they bypass the client-side check; acceptable for a personal app
- Cookie `SameSite=Lax` is sufficient for a localhost PWA; this may need revisiting for cross-origin deployment

## Success Criteria (Summary)

- Register → login → logout cycle completes without errors at `http://localhost:3010`
- Unauthenticated access to `/dashboard` redirects to `/login`
- Authenticated visit to `/login` or `/register` redirects to `/dashboard`
