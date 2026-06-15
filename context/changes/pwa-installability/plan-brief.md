# PWA Installability — Plan Brief

> Full plan: `context/changes/pwa-installability/plan.md`

## What & Why

FR-013 (must-have): Pay Tracker must be installable as a PWA on mobile and desktop. The
app currently has zero PWA infrastructure — no manifest, no service worker, no icons. This
plan adds the three browser-required ingredients to make the native install prompt appear.

## Starting Point

Next.js 16.2.9 with `output: "standalone"`. The frontend has a root `layout.tsx` with a
basic `metadata` export, a minimal `next.config.ts`, and an empty `public/` directory
containing only default Next.js SVGs. No PWA-related packages installed.

## Desired End State

Visiting Pay Tracker in Chrome, Edge, Firefox, or Safari triggers the browser's native
"Install" or "Add to Home Screen" prompt. The installed app opens in standalone mode (no
browser chrome), with a white splash background and blue title bar. A Lighthouse PWA
installability audit passes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Manifest mechanism | `app/manifest.ts` (Next.js built-in) | Next.js 16 ships native App Router support — no external library needed | Plan |
| Service worker scope | Fetch passthrough only | Broadest cross-browser install compat with < 20 lines of code; no offline caching complexity | Plan |
| Install prompt UX | Browser-native only | Zero UI code; `beforeinstallprompt` doesn't fire on iOS anyway | Plan |
| App icons | Placeholder PNGs (192×192, 512×512) | Unblocks installability; icon is a design task, not an engineering one | Plan |
| `theme_color` | `#2563eb` (Tailwind blue-600) | No brand color exists yet; conventional finance-app blue that reads well on Android status bars | Plan |
| `background_color` | `#ffffff` | Clean splash screen default, pairs with blue theme | Plan |

## Scope

**In scope:**
- `frontend/src/app/manifest.ts` — web app manifest
- `frontend/public/icon-192.png`, `frontend/public/icon-512.png` — placeholder icons
- `frontend/src/app/layout.tsx` — add `themeColor` to metadata + mount SW registrar
- `frontend/public/sw.js` — minimal fetch-passthrough service worker
- `frontend/src/components/pwa-register.tsx` — client-side SW registration component
- `frontend/next.config.ts` — `Cache-Control` + `Content-Type` headers for `sw.js`

**Out of scope:**
- Offline caching / app shell caching
- Push notifications
- Custom install banner / `beforeinstallprompt` UI
- HTTPS configuration (deployment concern, noted in PRD Open Questions)
- Real brand icon (design task)

## Architecture / Approach

Next.js 16 App Router conventions throughout. `app/manifest.ts` is auto-served at
`/manifest.webmanifest` and `<link rel="manifest">` is injected by the framework — no
manual `<link>` tag needed. The SW is a plain JS file in `public/` (not bundled). A
`'use client'` component handles registration in a `useEffect` and renders nothing — it is
mounted in `layout.tsx` as a leaf node outside the auth/locale providers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Manifest & Icons | Manifest at `/manifest.webmanifest`, icons in `public/`, `themeColor` meta tag | Icon generation tooling — requires ImageMagick, favicon generator, or one-off script |
| 2. Service Worker | `public/sw.js` passthrough + client registration + `next.config.ts` headers | SW scope must match app root; `updateViaCache: 'none'` prevents stale SW bugs |

**Prerequisites:** Dev server running (`docker compose up` or `npm run dev`); Chrome DevTools
for verification.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Icon generation requires a tool outside the codebase (ImageMagick, online generator, or
  `canvas` npm package). If none is available, the placeholder can be a 1×1 blue PNG
  expanded by CSS — not ideal but unblocks verification.
- iOS installability requires HTTPS. Testing on a real iOS device requires a TLS-terminated
  deployment or a local tunnel (e.g., `ngrok`). Localhost testing on iOS is not possible.
- The `output: "standalone"` Next.js config is assumed to include `public/` assets in the
  build output — this is standard Next.js behavior but should be verified after build.

## Success Criteria (Summary)

- Chrome DevTools Application → Manifest shows no errors and "Installable" is green
- Native install prompt appears in Chrome on desktop and Android
- Lighthouse PWA audit: Installable check passes
