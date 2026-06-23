# Standalone Electron App Implementation Plan

## Overview

Package Pay Tracker as a downloadable macOS DMG that requires no Docker, no Python, no Node.js from the user. Electron's main process spawns a PyInstaller-compiled FastAPI binary and the Next.js standalone server, then opens a native BrowserWindow. SQLite replaces PostgreSQL everywhere — in development (Docker, SQLite volume) and in the packaged app (user's Application Support directory).

## Current State Analysis

- Next.js frontend: `output: 'standalone'` already set in `next.config.ts`; `images: { unoptimized: true }` set
- FastAPI backend: PostgreSQL via `psycopg2-binary`; SMTP config from Pydantic env vars; `/health` endpoint exists; CORS includes `localhost:3010`
- APScheduler sends email reminders; no `app_config` table exists yet
- 13 Alembic migrations, all standard SQL (no JSONB, ARRAY, or pg enums) — being replaced by a single SQLite baseline
- `useNotifications` hook fires browser Notification API reactively on page load — being removed
- docker-compose runs PostgreSQL as a separate `db` service — being removed

## Desired End State

A user downloads `PayTracker.dmg`, drags to Applications, double-clicks (right-click → Open on first launch to bypass Gatekeeper), and the app opens showing the Pay Tracker UI. No terminal, no Docker, no dependencies required. Daily OS-level notifications fire on schedule from Notification Center. SMTP credentials are saved via the Settings UI and stored securely in the macOS Keychain.

### Key Discoveries

- `backend/app/core/database.py`: `create_engine(settings.database_url)` — needs `connect_args={"check_same_thread": False}` for SQLite
- `backend/app/core/config.py`: all 6 SMTP fields are optional Pydantic settings read from env — email service needs a DB-first read layer added
- `backend/app/services/email.py`: `send_reminder_email()` takes SMTP params explicitly — the caller (`reminder_job.py`) is where DB-first lookup goes
- `backend/app/main.py`: lifespan starts APScheduler — stays intact; Electron notifications are additive, not a replacement for email
- `frontend/src/hooks/useNotifications.ts`: uses `ServiceWorkerRegistration.showNotification()` with localStorage dedup — being removed entirely
- `frontend/src/app/dashboard/settings/page.tsx`: has `BrowserNotificationsTile` component wired to the hook — tile removed along with hook
- `frontend/next.config.ts`: standalone output already configured — no change needed

## What We're NOT Doing

- Windows or Linux packaging (macOS DMG only for v1)
- Code signing / Apple notarization (personal use; bypass with right-click → Open)
- `electron-updater` auto-install (deferred until Apple Developer account obtained)
- Keeping the `useNotifications` browser hook in any form
- Keeping the PostgreSQL `db` service in docker-compose
- Keeping the `testcontainers[postgresql]` dev dependency

## Implementation Approach

Single codebase, two runtime targets: Docker+SQLite for development, Electron+SQLite for distribution. The DATABASE_URL env var is the only switch — `sqlite:////data/pay-tracker.db` in Docker, `sqlite:////Users/<name>/Library/Application Support/PayTracker/pay-tracker.db` injected by Electron main.js at spawn time. All other backend code is identical between targets.

## Critical Implementation Details

**SQLite thread safety:** SQLAlchemy's SQLite dialect requires `connect_args={"check_same_thread": False}` when the engine is shared across threads (FastAPI + APScheduler). Missing this causes `ProgrammingError: SQLite objects created in a thread can only be used in that same thread`.

**PyInstaller + keyring:** The macOS keyring backend (`keyring.backends.macOS`) is a compiled extension that PyInstaller does not auto-detect. It must be listed explicitly in `hiddenimports` in the `.spec` file, otherwise `keyring.get_password()` raises `NoKeyringError` at runtime in the packaged binary.

**Next.js standalone server port:** `server.js` reads the `PORT` env var (defaults to 3000). Electron main.js must set `PORT=3010` before spawning it, otherwise the BrowserWindow opens at the wrong address.

**Electron spawning Next.js:** Use `process.execPath` (Electron's bundled Node binary) to run `server.js` — do not rely on a system `node` binary, which may not exist on the user's machine.

---

## Phase 1: SQLite Migration

### Overview

Replace PostgreSQL with SQLite across the entire stack: backend deps, SQLAlchemy engine, Alembic config, docker-compose. The 13 existing migrations are retired and replaced by a single clean baseline revision.

### Changes Required

#### 1. Remove psycopg2-binary, add no driver

**File:** `backend/pyproject.toml`

**Intent:** Drop `psycopg2-binary` (PostgreSQL C driver). SQLite uses Python's stdlib `sqlite3` — no driver package needed. Also remove `testcontainers[postgresql]` from dev dependencies.

**Contract:** Delete the `psycopg2-binary>=...` line from `[project.dependencies]` and `testcontainers[postgresql]>=...` from `[tool.uv.dev-dependencies]`.

#### 2. Update DATABASE_URL default and engine

**File:** `backend/app/core/config.py`

**Intent:** Change the default `DATABASE_URL` so running the backend without any env var targets SQLite out of the box.

**Contract:** Change the `database_url` field default from `postgresql://...` to `sqlite:///./pay-tracker.db`.

**File:** `backend/app/core/database.py`

**Intent:** Add the SQLite thread-safety flag required when APScheduler and FastAPI share the same engine across threads.

**Contract:** Change `create_engine(settings.database_url)` to `create_engine(settings.database_url, connect_args={"check_same_thread": False})`. The `connect_args` dict is ignored by non-SQLite dialects if ever needed, but since we're dropping PostgreSQL entirely, it's unconditional.

#### 3. Replace Alembic migrations with a single SQLite baseline

**File:** `backend/alembic/versions/` (delete all 13 files, create one new file)

**Intent:** The 13 accumulated migrations carried PostgreSQL-era history. A fresh single revision creates the final schema directly against SQLite, eliminating accumulated migration debt.

**Contract:** Delete all files in `alembic/versions/`. Create `0001_sqlite_baseline.py` that creates tables `users`, `bill_templates`, `payment_instances` with the exact final column set from the current models (including all fields added across the 13 old revisions: `start_period`, `language_preference`, `currency`, `reminder_send_minute`, `is_deleted`, `email_sent_at`, reminder flags, `monthly_summary_enabled`, `monthly_summary_last_sent`). Unique constraint `(bill_id, period)` on `payment_instances`. No `downgrade()` needed (return immediately).

Also update `backend/alembic/env.py` if it references `postgresql` dialect anywhere.

#### 4. Update docker-compose

**File:** `docker-compose.yml` (root)

**Intent:** Remove the PostgreSQL `db` service entirely; give the backend container a persistent SQLite volume mount; inject the SQLite DATABASE_URL.

**Contract:**
- Delete the entire `db:` service block
- Delete `depends_on: [db]` from the `backend:` service
- Delete any PostgreSQL health-check references
- Add volume mount: `- sqlite_data:/data` to the `backend:` service
- Add env var: `DATABASE_URL=sqlite:////data/pay-tracker.db` to the `backend:` service environment
- Add `sqlite_data:` to the top-level `volumes:` block

#### 5. Update .env.example

**File:** `.env.example`

**Intent:** Remove the PostgreSQL DATABASE_URL line; document the SQLite default.

**Contract:** Replace the `DATABASE_URL=postgresql://...` line with `# DATABASE_URL=sqlite:///./pay-tracker.db  # default; override for custom path`.

### Success Criteria

#### Automated Verification

- Fresh migration applies on SQLite: `cd backend && DATABASE_URL=sqlite:///./test.db uv run alembic upgrade head` — exits 0, no errors
- Backend starts on SQLite: `DATABASE_URL=sqlite:///./test.db uv run uvicorn app.main:app` — no import or engine errors
- `docker compose up --build` completes without errors (no PostgreSQL service, no connection refused)
- `curl http://localhost:8010/health` → `{"status": "ok"}`

#### Manual Verification

- `docker compose up --build`, then open `http://localhost:3010` — login flow works, bills load
- `docker compose down -v && docker compose up --build` — clean slate works, migrations reapply

---

## Phase 2: SMTP Config in DB + Remove Browser Notification Hook

### Overview

Move SMTP configuration from env-only to a `app_config` SQLite table, surfaced via a new Settings UI section. Email service reads DB first, falls back to env vars (so Docker dev with `.env` continues to work). Remove the `useNotifications` hook and its `BrowserNotificationsTile` from the Settings page.

### Changes Required

#### 1. AppConfig model

**File:** `backend/app/models/app_config.py` (new file)

**Intent:** Simple key-value store for app-level configuration. Reuses the existing SQLAlchemy 2.0 `Mapped[T]` / `mapped_column()` pattern from `bill.py`.

**Contract:** `AppConfig` model with `key: Mapped[str]` (primary key) and `value: Mapped[str | None]`. Import `Base` from `backend/app/core/database.py`.

#### 2. Alembic migration for app_config table

**File:** `backend/alembic/versions/0002_add_app_config.py` (new file)

**Intent:** Add the `app_config` table after the baseline.

**Contract:** `upgrade()` creates table `app_config` with columns `key VARCHAR PRIMARY KEY`, `value TEXT NULL`. `downgrade()` drops the table. Set `down_revision = '0001_sqlite_baseline'`.

#### 3. SMTP schema

**File:** `backend/app/schemas/app_config.py` (new file)

**Intent:** Typed request/response for the SMTP config endpoint.

**Contract:** Pydantic model `SmtpConfigSchema` with fields: `smtp_host: str | None`, `smtp_port: int = 587`, `smtp_user: str | None`, `smtp_from: str | None`, `smtp_use_tls: bool = True`, `smtp_password: str | None` (write-only — on read, return `None` if not set, `"***"` if set, never return the plaintext value).

#### 4. Config router

**File:** `backend/app/routers/config.py` (new file)

**Intent:** Expose `GET /config/smtp` and `PUT /config/smtp` endpoints for the Settings UI.

**Contract:**
- `GET /config/smtp`: reads `app_config` rows for keys `smtp_host`, `smtp_port`, `smtp_user`, `smtp_from`, `smtp_use_tls`; reads password presence from keyring (`keyring.get_password("pay-tracker", "smtp_password") is not None`); returns `SmtpConfigSchema` with `smtp_password` masked
- `PUT /config/smtp`: upserts each field into `app_config`; writes password to keyring via `keyring.set_password("pay-tracker", "smtp_password", value)` if provided and non-empty
- Both endpoints require auth (use existing `get_current_user` dependency)
- Register router in `backend/app/main.py` with prefix `/config`

#### 5. Add keyring dependency

**File:** `backend/pyproject.toml`

**Intent:** Add the `keyring` library for macOS Keychain integration.

**Contract:** Add `keyring>=25.0` to `[project.dependencies]`.

#### 6. Update email service to read SMTP config from DB

**File:** `backend/app/services/reminder_job.py`

**Intent:** Before sending any email, attempt to load SMTP config from `app_config` table; fall back to Pydantic env-var settings if DB fields are empty. This keeps Docker dev with `.env` working without any extra configuration.

**Contract:** Extract a helper `get_smtp_config(db: Session) -> dict | None` that queries `app_config` for the 5 SMTP keys and reads the password from keyring. If `smtp_host` row is absent or empty, returns `None` and the caller falls back to `settings.smtp_host` etc. The existing `send_reminder_email()` call sites in `reminder_job.py` use this helper's result if non-None, otherwise use `settings.*` values unchanged.

#### 7. Remove useNotifications hook and BrowserNotificationsTile

**File:** `frontend/src/hooks/useNotifications.ts`

**Intent:** Hook is no longer needed — Electron handles scheduled OS notifications from main process; Docker dev does not need in-app notification toasts.

**Contract:** Delete the file entirely.

**File:** `frontend/src/app/dashboard/settings/page.tsx`

**Intent:** Remove the `BrowserNotificationsTile` component and its import of `useNotifications`.

**Contract:** Delete the `BrowserNotificationsTile` component definition and its render call in the settings page JSX. Remove the `useNotifications` import. The remaining tiles (Profile, EmailNotifications, Backup, Restore) are unchanged.

**File:** `frontend/src/components/pwa-register.tsx` and `frontend/public/sw.js`

**Intent:** Service worker passthrough is only needed for PWA. In Electron context it is unused; in Docker dev it is harmless but no longer serves notifications.

**Contract:** Delete `pwa-register.tsx`. Remove its import and usage from `frontend/src/app/layout.tsx`. Leave `public/sw.js` in place (harmless, avoids 404 if browser requests it).

#### 8. Add Email Notifications section to Settings UI

**File:** `frontend/src/app/dashboard/settings/page.tsx`

**Intent:** Allow users to configure SMTP from the Settings UI instead of needing to edit `.env`.

**Contract:** Add a new tile `SmtpConfigTile` in the settings page (same pattern as existing tiles). Fields: SMTP Host (text), Port (number, default 587), Username (text), From Address (text), Password (password input, masked), Use TLS (toggle). On save, call `PUT /api/config/smtp`. On load, call `GET /api/config/smtp` to pre-fill fields (password field shows placeholder "••••••••" if a password is already stored). Add corresponding API client function in `frontend/src/lib/user-api.ts`.

### Success Criteria

#### Automated Verification

- `docker compose up --build` starts cleanly with migration `0002_add_app_config` applied
- `curl -X GET http://localhost:8010/config/smtp` (with auth token) → 200, returns SMTP fields
- `curl -X PUT http://localhost:8010/config/smtp` with JSON body → 200, upserts rows in `app_config`
- `npm run lint` passes in frontend (no dead imports from removed hook)
- TypeScript build passes: `cd frontend && npm run build`

#### Manual Verification

- Open Settings page → "Email Notifications" SMTP section visible with all fields
- Enter SMTP credentials → Save → reload Settings → fields pre-filled (password masked)
- Email reminder fires using DB-sourced SMTP config (trigger via "Send test notification" button)
- `BrowserNotificationsTile` is gone from Settings page with no visual gap or error

---

## Phase 3: PyInstaller Binary

### Overview

Compile the FastAPI backend into a single self-contained binary using PyInstaller. The binary must start uvicorn, apply Alembic migrations, and serve the API on port 8010 without any virtualenv or Python installation on the user's machine.

### Changes Required

#### 1. PyInstaller spec file

**File:** `backend/pay-tracker-backend.spec` (new file)

**Intent:** Declare all hidden imports that PyInstaller's static analysis misses, bundle Alembic migration files as data, and produce a single-file executable.

**Contract:**

```python
# pay-tracker-backend.spec
a = Analysis(
    ['app/main.py'],
    hiddenimports=[
        'uvicorn.lifespan.on',
        'uvicorn.logging',
        'uvicorn.loops.auto',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'sqlalchemy.dialects.sqlite',
        'sqlalchemy.dialects.sqlite.pysqlite',
        'apscheduler.schedulers.background',
        'apscheduler.executors.pool',
        'apscheduler.jobstores.memory',
        'keyring.backends.macOS',
        'keyring.backends.fail',
    ],
    datas=[
        ('alembic', 'alembic'),
        ('alembic.ini', '.'),
    ],
)
exe = EXE(a.pure, a.scripts, a.binaries, a.zipfiles, a.datas,
          name='pay-tracker-backend', onefile=True, console=False)
```

#### 2. Alembic path fix for frozen binary

**File:** `backend/alembic/env.py`

**Intent:** When running as a PyInstaller binary, `__file__` points inside the temp extraction directory. Alembic's `script_location` must resolve relative to `sys._MEIPASS` (the extraction root) when frozen.

**Contract:** At the top of `env.py`, add:
```python
import sys, os
if getattr(sys, 'frozen', False):
    os.chdir(sys._MEIPASS)
```
This ensures `alembic upgrade head` finds `alembic/versions/` correctly when called from within the binary.

#### 3. Startup migration trigger in main.py

**File:** `backend/app/main.py`

**Intent:** In the packaged binary, there's no supervisord to run `alembic upgrade head` before uvicorn starts. The lifespan hook must run migrations programmatically on startup.

**Contract:** In the `lifespan` async context manager, before the scheduler starts, add:
```python
from alembic.config import Config
from alembic import command
alembic_cfg = Config("alembic.ini")
command.upgrade(alembic_cfg, "head")
```
This is idempotent — if the schema is current, Alembic does nothing.

### Success Criteria

#### Automated Verification

- Build completes: `cd backend && uv run pyinstaller pay-tracker-backend.spec` — exits 0
- Binary exists: `backend/dist/pay-tracker-backend` — file size 80–150 MB

#### Manual Verification

- Run binary directly: `DATABASE_URL=sqlite:///./test.db ./backend/dist/pay-tracker-backend`
- `curl http://localhost:8010/health` → `{"status": "ok"}` within 5 seconds
- `curl http://localhost:8010/docs` → 200 (Swagger UI)
- Binary runs from a directory with no `venv`, no `uv`, no Python in PATH

---

## Phase 4: Electron Scaffold

### Overview

Create the Electron shell: `electron/main.js` spawns the backend binary and the Next.js server, polls `/health` until ready, then opens a `BrowserWindow`. A `preload.js` exposes the IPC bridge to the renderer. A root `package.json` wires up `electron-builder` and dev scripts.

### Changes Required

#### 1. Root package.json

**File:** `package.json` (new file at repo root)

**Intent:** Declare Electron and electron-builder as dev dependencies; define the `electron:dev` and `electron:build` scripts; point `main` at `electron/main.js`.

**Contract:**
```json
{
  "name": "pay-tracker",
  "version": "0.1.0",
  "main": "electron/main.js",
  "scripts": {
    "electron:dev": "electron .",
    "electron:build": "electron-builder"
  },
  "devDependencies": {
    "electron": "^35.0.0",
    "electron-builder": "^26.0.0",
    "better-sqlite3": "^11.0.0",
    "node-cron": "^3.0.0"
  }
}
```

#### 2. Electron main process

**File:** `electron/main.js` (new file)

**Intent:** Orchestrate both child processes, wait for the backend to be healthy, open the window, and clean up on quit.

**Contract:** The file must:

1. **Resolve paths** — when `app.isPackaged`, use `process.resourcesPath` to find `pay-tracker-backend` binary and `nextjs/server.js`; in dev, use relative paths `../backend/dist/pay-tracker-backend` and `../frontend/.next/standalone/server.js`
2. **Inject env vars** — before spawning backend: `DATABASE_URL` set to `path.join(app.getPath('userData'), 'pay-tracker.db')`; `PORT=8010`; `HOST=127.0.0.1`
3. **Spawn backend** — `child_process.spawn(backendPath, [], { env })` — capture stderr for logging
4. **Spawn Next.js** — `child_process.spawn(process.execPath, [nextServerPath], { env: { ...process.env, PORT: '3010', HOSTNAME: '127.0.0.1' } })`
5. **Poll health** — `net.fetch('http://127.0.0.1:8010/health')` every 500ms, timeout after 30s, then create `BrowserWindow`
6. **BrowserWindow** — `{ width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } }` → `loadURL('http://localhost:3010')`
7. **Quit cleanup** — `app.on('before-quit')` kills both child processes with `SIGTERM`
8. **Update check** — call `checkForUpdates()` 3 seconds after window is shown (implemented in Phase 8)

#### 3. Preload script

**File:** `electron/preload.js` (new file)

**Intent:** Expose a minimal IPC bridge from renderer to main process. `contextIsolation: true` means the renderer cannot access Node APIs directly.

**Contract:**
```js
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  updateReminder: (minute) => ipcRenderer.send('reminder:update', minute)
})
```

### Success Criteria

#### Automated Verification

- `npm install` at repo root resolves without errors
- `npm run electron:dev` launches without "cannot find module" errors (requires Phase 3 binary built and Phase 1 Next.js standalone built)

#### Manual Verification

- `npm run electron:dev` — native window opens showing Pay Tracker login page
- Login works, bills load, settings page accessible
- Closing the window kills both child processes (verify with `ps aux | grep pay-tracker`)
- App quits cleanly with no zombie processes

---

## Phase 5: Native Notifications

### Overview

Add a `node-cron` job in Electron's main process that reads the user's `reminder_send_minute` from SQLite via `better-sqlite3` and fires a native macOS notification at the scheduled time. Wire the Settings page reminder-time save to update the cron schedule via IPC without restarting the app.

### Changes Required

#### 1. Notification cron in main.js

**File:** `electron/main.js`

**Intent:** Fire a native OS notification at the user's configured reminder time each day, reading the schedule directly from SQLite.

**Contract:** After the BrowserWindow is shown, add:

```js
const Database = require('better-sqlite3')
const cron = require('node-cron')

let reminderJob = null

function scheduleReminder() {
  const dbPath = path.join(app.getPath('userData'), 'pay-tracker.db')
  const db = new Database(dbPath, { readonly: true })
  const row = db.prepare("SELECT value FROM app_config WHERE key = 'reminder_send_minute'").get()
  db.close()

  const minute = row ? parseInt(row.value, 10) : 480  // default 8:00 AM
  const h = Math.floor(minute / 60)
  const m = minute % 60

  if (reminderJob) reminderJob.stop()
  reminderJob = cron.schedule(`${m} ${h} * * *`, () => {
    new Notification({ title: 'Pay Tracker', body: 'Check your upcoming bills.' }).show()
  })
}

scheduleReminder()

ipcMain.on('reminder:update', (_, minute) => {
  // Persist to app_config via backend API call is done by the frontend already;
  // here we just reschedule the cron with the new value
  const h = Math.floor(minute / 60)
  const m = minute % 60
  if (reminderJob) reminderJob.stop()
  reminderJob = cron.schedule(`${m} ${h} * * *`, () => {
    new Notification({ title: 'Pay Tracker', body: 'Check your upcoming bills.' }).show()
  })
})
```

#### 2. Wire Settings page reminder save to IPC

**File:** `frontend/src/app/dashboard/settings/page.tsx`

**Intent:** When the user saves a new reminder time in Settings, notify Electron main to reschedule the cron — without requiring an app restart.

**Contract:** In the `EmailNotificationsTile` save handler, after the successful `PUT /auth/me` API call that persists `reminder_send_minute`, add:
```ts
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.updateReminder(reminderSendMinute)
}
```
The `window.electronAPI` guard ensures this is a no-op in Docker dev (where `preload.js` is not injected).

#### 3. TypeScript types for electronAPI

**File:** `frontend/src/types/electron.d.ts` (new file)

**Intent:** Prevent TypeScript from erroring on `window.electronAPI`.

**Contract:**
```ts
interface Window {
  electronAPI?: {
    updateReminder: (minute: number) => void
  }
}
```

### Success Criteria

#### Automated Verification

- `npm run electron:dev` — no cron-related import errors at startup
- TypeScript build passes: `cd frontend && npm run build`

#### Manual Verification

- Set reminder time to 1 minute from now in Settings → save → OS notification fires at that minute
- Change reminder time again without restarting app → cron reschedules correctly
- Notification appears in macOS Notification Center (not just a transient toast)

---

## Phase 6: electron-builder Config

### Overview

Configure `electron-builder` to produce a macOS DMG containing the Electron app, the PyInstaller backend binary, and the Next.js standalone server.

### Changes Required

#### 1. electron-builder.yml

**File:** `electron-builder.yml` (new file at repo root)

**Intent:** Declare packaging targets, resource bundling, and app identity.

**Contract:**
```yaml
appId: com.paytracker.app
productName: Pay Tracker
directories:
  output: dist-electron
mac:
  target:
    - target: dmg
      arch:
        - arm64
        - x64
  category: public.app-category.finance
  icon: electron/assets/icon.icns
files:
  - electron/**
  - node_modules/**
extraResources:
  - from: backend/dist/pay-tracker-backend
    to: pay-tracker-backend
  - from: frontend/.next/standalone
    to: nextjs
```

#### 2. App icon

**File:** `electron/assets/icon.icns` (new file)

**Intent:** macOS requires a `.icns` file for the app icon in the DMG and Dock.

**Contract:** Create `electron/assets/` directory. Generate `icon.icns` from a 1024×1024 PNG using `iconutil` or `sips`. Placeholder: a simple blue square is acceptable for v1. The exact icon design is out of scope for this plan.

### Success Criteria

#### Automated Verification

- `npm run electron:build` completes without errors
- `dist-electron/Pay Tracker-0.1.0-arm64.dmg` exists (or x64 variant depending on build machine)

#### Manual Verification

- Mount the DMG → drag Pay Tracker.app to Applications
- Launch from Applications (right-click → Open on first launch)
- App opens, login works, bills load
- App appears in macOS Notification Center permissions (System Preferences → Notifications)

---

## Phase 7: GitHub Actions Release Workflow

### Overview

Automate the full build pipeline on GitHub Actions. Pushing a `v*.*.*` tag triggers a macOS build that produces the DMG and attaches it to a GitHub Release.

### Changes Required

#### 1. Release workflow

**File:** `.github/workflows/release.yml` (new file)

**Intent:** Build frontend, backend binary, and Electron DMG in one job; upload DMG to the GitHub Release created by the tag push.

**Contract:**
```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'

      - name: Install uv
        run: curl -LsSf https://astral.sh/uv/install.sh | sh

      - name: Build frontend (standalone)
        run: cd frontend && npm ci && npm run build

      - name: Build backend binary
        run: |
          cd backend
          uv sync
          uv run pyinstaller pay-tracker-backend.spec

      - name: Install root deps (Electron)
        run: npm ci

      - name: Build DMG
        run: npm run electron:build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload DMG to release
        run: |
          gh release upload ${{ github.ref_name }} dist-electron/*.dmg
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Success Criteria

#### Automated Verification

- Push tag `v0.1.0-test` → workflow appears in Actions tab
- All steps pass (green)
- DMG file visible in the GitHub Release assets

#### Manual Verification

- Download the DMG from the GitHub Release
- Install and launch on a clean Mac (no dev tools, no Docker)
- Full login → bills → settings flow works

---

## Phase 8: Update Checker

### Overview

On each app launch, check the latest GitHub Release tag and prompt the user to download if a newer version is available.

### Changes Required

#### 1. checkForUpdates in main.js

**File:** `electron/main.js`

**Intent:** Non-blocking version check that prompts the user once per launch if an update is available. Does not auto-install — opens the GitHub Release page in the browser.

**Contract:** Add after BrowserWindow is shown (with a 3-second delay to avoid blocking startup):

```js
const { net, dialog, shell } = require('electron')

async function checkForUpdates() {
  try {
    const res = await net.fetch(
      'https://api.github.com/repos/<owner>/pay-tracker/releases/latest',
      { headers: { 'User-Agent': 'PayTracker/' + app.getVersion() } }
    )
    if (!res.ok) return
    const { tag_name, html_url } = await res.json()
    const latest = tag_name.replace(/^v/, '')
    if (latest !== app.getVersion()) {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        message: `Pay Tracker ${tag_name} is available`,
        detail: `You have v${app.getVersion()}. Open the download page?`,
      })
      if (response === 0) shell.openExternal(html_url)
    }
  } catch (_) {
    // silently ignore — no network, private repo, rate limit, etc.
  }
}

setTimeout(checkForUpdates, 3000)
```

Replace `<owner>` with the actual GitHub username/org before shipping.

### Success Criteria

#### Automated Verification

- No TypeScript/lint errors (main.js is plain JS, no compile step)

#### Manual Verification

- Build `v0.1.0`, then push `v0.1.1` tag and create a release
- Launch the `v0.1.0` DMG → update dialog appears after ~3 seconds
- Click "Download" → browser opens the GitHub Release page
- Click "Later" → dialog closes, app continues normally
- On latest version: no dialog appears

---

## Testing Strategy

### Manual Testing Sequence (per phase)

Follow the verification table from the plan-brief. Each phase has its own manual gate before proceeding.

### Integration Test (after Phase 4)

Full app smoke test in Electron dev mode:
1. `npm run electron:dev`
2. Register a new user
3. Create a bill template
4. Verify payment instances generate
5. Mark a payment paid
6. Open Settings, configure SMTP, save
7. Open Settings, change reminder time, verify cron reschedules (check at the set minute)

### Packaging Test (after Phase 6)

1. Build DMG on a dev machine
2. Install on a second Mac with no dev tools
3. Run the full smoke test above on the clean machine

## Migration Notes

The 13-migration PostgreSQL chain is permanently retired. Any existing Docker dev databases are wiped when running `docker compose down -v && docker compose up --build`. This is expected — the volume held PostgreSQL data which is incompatible with SQLite. Fresh start required after Phase 1.

## References

- Plan brief: `context/changes/standalone-electron-app/plan-brief.md`
- Change notes: `context/changes/standalone-electron-app/change.md`
- Backend config: `backend/app/core/config.py`
- Database setup: `backend/app/core/database.py`
- Email service: `backend/app/services/email.py`
- Reminder job: `backend/app/services/reminder_job.py`
- Settings page: `frontend/src/app/dashboard/settings/page.tsx`
- Next.js config: `frontend/next.config.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: SQLite Migration

#### Automated

- [ ] 1.1 Fresh migration applies on SQLite: `DATABASE_URL=sqlite:///./test.db uv run alembic upgrade head` exits 0
- [ ] 1.2 Backend starts on SQLite without errors
- [ ] 1.3 `docker compose up --build` completes without errors
- [ ] 1.4 `curl http://localhost:8010/health` → `{"status": "ok"}`

#### Manual

- [ ] 1.5 Login flow works and bills load at `http://localhost:3010` via Docker
- [ ] 1.6 `docker compose down -v && docker compose up --build` clean restart works

### Phase 2: SMTP Config in DB + Remove Browser Notification Hook

#### Automated

- [ ] 2.1 `docker compose up --build` applies migration `0002_add_app_config` cleanly
- [ ] 2.2 `GET /config/smtp` returns 200 with SMTP fields
- [ ] 2.3 `PUT /config/smtp` returns 200 and upserts app_config rows
- [ ] 2.4 `npm run lint` passes with no dead imports
- [ ] 2.5 `cd frontend && npm run build` TypeScript build passes

#### Manual

- [ ] 2.6 Settings page shows SMTP section with all fields
- [ ] 2.7 SMTP credentials save and reload correctly (password masked)
- [ ] 2.8 Email reminder fires using DB-sourced SMTP config
- [ ] 2.9 BrowserNotificationsTile absent from Settings page

### Phase 3: PyInstaller Binary

#### Automated

- [ ] 3.1 `cd backend && uv run pyinstaller pay-tracker-backend.spec` exits 0
- [ ] 3.2 `backend/dist/pay-tracker-backend` binary exists (80–150 MB)

#### Manual

- [ ] 3.3 Binary starts and `curl http://localhost:8010/health` → 200
- [ ] 3.4 Binary runs from directory with no venv or Python in PATH

### Phase 4: Electron Scaffold

#### Automated

- [ ] 4.1 `npm install` at repo root resolves without errors
- [ ] 4.2 `npm run electron:dev` launches without module errors

#### Manual

- [ ] 4.3 Native window opens showing Pay Tracker login page
- [ ] 4.4 Login, bills, settings all work in Electron window
- [ ] 4.5 Child processes killed cleanly on quit

### Phase 5: Native Notifications

#### Automated

- [ ] 5.1 `npm run electron:dev` starts without cron import errors
- [ ] 5.2 `cd frontend && npm run build` passes with `electron.d.ts` types

#### Manual

- [ ] 5.3 OS notification fires at the set reminder time
- [ ] 5.4 Reminder reschedules without app restart after Settings save

### Phase 6: electron-builder Config

#### Automated

- [ ] 6.1 `npm run electron:build` exits 0
- [ ] 6.2 DMG file exists in `dist-electron/`

#### Manual

- [ ] 6.3 DMG installs and app launches on local Mac
- [ ] 6.4 App appears in Notification Center permissions

### Phase 7: GitHub Actions Release Workflow

#### Automated

- [ ] 7.1 Tag push triggers workflow and all steps pass
- [ ] 7.2 DMG visible in GitHub Release assets

#### Manual

- [ ] 7.3 Downloaded DMG installs and runs on a clean Mac

### Phase 8: Update Checker

#### Automated

- [ ] 8.1 No errors in main.js at startup (check Electron DevTools console)

#### Manual

- [ ] 8.2 Update dialog appears when running an older version
- [ ] 8.3 "Download" opens browser to GitHub Release page
- [ ] 8.4 "Later" dismisses dialog; app continues normally
