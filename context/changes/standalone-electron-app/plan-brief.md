---
change_id: standalone-electron-app
type: plan-brief
created: 2026-06-23
---

# Standalone Electron App — Plan Brief

> Full plan: `context/changes/standalone-electron-app/plan.md`
> Change notes: `context/changes/standalone-electron-app/change.md`

## What & Why

Package Pay Tracker as a downloadable macOS DMG that requires nothing from the user — no Docker, no Python, no Node.js. Electron's main process spawns a PyInstaller-compiled FastAPI binary and the Next.js standalone server, then opens a native BrowserWindow. SQLite replaces PostgreSQL everywhere, eliminating the external database dependency entirely.

## Starting Point

The app currently runs via Docker Compose with a PostgreSQL `db` service alongside the FastAPI backend and Next.js frontend. `output: 'standalone'` is already set in `next.config.ts`. There are 13 Alembic migrations (all standard SQL, no PostgreSQL-specific types) and an existing browser-notification hook that fires reactively on page load.

## Desired End State

User downloads `PayTracker.dmg`, drags to Applications, right-clicks → Open on first launch to bypass Gatekeeper, and sees the Pay Tracker UI. No terminal, no Docker, no dependencies required. Daily OS-level notifications fire from Notification Center on a user-configured schedule. SMTP credentials are saved via the Settings UI and stored in the macOS Keychain.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Database | SQLite only — PostgreSQL dropped entirely | Eliminates server dependency; no PostgreSQL-specific types in schema | Plan |
| Dev workflow | Docker stays, PostgreSQL service removed, SQLite volume mounted | Same `docker compose up` muscle memory; no new dev tooling needed | Plan |
| Alembic migrations | Fresh single baseline revision replaces all 13 | SQLite-only target; one migration tree to maintain | Plan |
| SMTP password storage | OS keychain via Python `keyring` library | Password never touches disk in plaintext; standard for desktop apps | Plan |
| SMTP config source | DB-first, env-var fallback | Same code path in dev and production; Docker dev `.env` continues working | Plan |
| Browser notification hook | Removed entirely | Electron main-process cron replaces it; Docker dev is developer-only | Plan |
| Notifications | `node-cron` in Electron main + `better-sqlite3` direct DB read | Background notifications fire even when window is minimised | Change / Plan |
| Platform | macOS only for v1 (arm64 + x64 universal DMG) | Scope control; Windows/Linux in a follow-up change | Change |
| Auto-update | Lightweight GitHub API checker; no auto-install | No Apple Developer account required; `electron-updater` deferred | Change |
| Code signing | Deferred | Personal use; bypass with right-click → Open | Change |

## Scope

**In scope:**
- SQLite migration (drop PostgreSQL, update docker-compose, fresh Alembic baseline)
- `app_config` table + `GET/PUT /config/smtp` API + Settings UI SMTP section
- Python `keyring` integration for SMTP password in macOS Keychain
- Remove `useNotifications` hook and `BrowserNotificationsTile`
- PyInstaller spec + startup migration trigger in lifespan
- Electron scaffold (`main.js`, `preload.js`, root `package.json`)
- `node-cron` background notifications in Electron main process
- `electron-builder.yml` targeting macOS DMG (arm64 + x64)
- GitHub Actions release workflow triggered by `v*.*.*` tags
- GitHub API update checker in `main.js`

**Out of scope:**
- Windows or Linux packaging
- Apple code signing / notarization
- `electron-updater` auto-install
- Push notification server / Web Push
- Keeping the PostgreSQL dev path in any form

## Architecture / Approach

```
[Electron main process]
  ├── spawns PyInstaller binary    →  FastAPI/uvicorn on 127.0.0.1:8010
  │     └── DATABASE_URL injected  →  ~/Library/Application Support/PayTracker/pay-tracker.db
  ├── spawns process.execPath      →  Next.js server.js on 127.0.0.1:3010
  ├── polls /health until ready
  ├── opens BrowserWindow          →  http://localhost:3010
  ├── node-cron fires daily        →  new Notification() at reminder_send_minute
  └── before-quit: SIGTERM both children
```

Dev path: `docker compose up --build` — same command, PostgreSQL service gone, SQLite file at `/data/pay-tracker.db` in a named volume.

Release path: GitHub Actions on `macos-latest` — `next build` → `pyinstaller` → `electron-builder` → DMG uploaded to GitHub Release.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. SQLite Migration | Drop PostgreSQL, fresh Alembic baseline, update docker-compose | Fresh baseline must match all current model fields exactly |
| 2. SMTP in DB + Hook removal | `app_config` table, SMTP API + Settings UI, keyring, remove notification hook | keyring hidden-import in PyInstaller; Settings UI regression |
| 3. PyInstaller Binary | Self-contained backend binary | Hidden imports (uvicorn, keyring.backends.macOS, apscheduler) |
| 4. Electron Scaffold | Native window spawning both child processes | Process lifecycle / port collision on dev restarts |
| 5. Native Notifications | node-cron + better-sqlite3, IPC reschedule | Cron not firing after sleep/wake on macOS |
| 6. electron-builder Config | Signed-ready DMG (arm64 + x64) | Icon asset required; resource path resolution in packaged app |
| 7. GitHub Actions Release | Automated DMG build + publish on tag push | uv + pyinstaller on macos-latest runner availability |
| 8. Update Checker | Version dialog on launch if newer release exists | GitHub API rate limit (unauthenticated = 60 req/hr) |

**Prerequisites:** GitHub repo with Actions enabled; macOS machine for local packaging tests; `icon.icns` placeholder for Phase 6.

**Estimated effort:** ~4-6 focused sessions across 8 phases; Phases 1-2 are the heaviest backend changes; Phases 3-4 are the integration risk; Phases 5-8 are additive.

## Open Risks & Assumptions

- PyInstaller hidden-import list for `keyring.backends.macOS` and all uvicorn sub-modules must be verified by actually running the binary — static analysis cannot guarantee completeness
- `node-cron` may not fire reliably after macOS sleep/wake — may need `powerMonitor` event to reschedule on resume
- `better-sqlite3` requires a native build matching the Electron Node ABI — `electron-rebuild` must be run after `npm install`
- The GitHub owner name (`<owner>`) in the update checker URL must be set before Phase 8 ships

## Success Criteria (Summary)

- User on a clean Mac (no dev tools) downloads the DMG, installs, and reaches the bills dashboard
- A scheduled OS notification fires at the configured reminder time without the app window being focused
- Pushing a `v*.*.*` git tag produces a DMG attached to the GitHub Release with no manual steps
