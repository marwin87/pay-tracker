---
change_id: standalone-electron-app
title: Package Pay Tracker as a standalone Electron desktop app (macOS first)
status: planned
created: 2026-06-17
updated: 2026-06-23
plan: context/changes/standalone-electron-app/plan.md
archived_at: null
---

## Notes

Goal: ship Pay Tracker as a downloadable native app that requires no Docker, no Node.js, no Python — user downloads one file, installs it, and it just works.

---

### Why Electron

Next.js `output: 'standalone'` already produces a plain `node server.js`. Electron's main process **is** Node.js, so it runs the Next.js server directly without bundling a separate Node binary. The FastAPI backend is compiled via PyInstaller into a single binary and spawned as a child process by Electron's main process. The user sees a native window (no browser URL bar). `electron-builder` handles cross-platform packaging from one GitHub Actions matrix.

Alternative considered: Tauri (~15 MB vs ~300 MB) — smaller but the Python backend becomes an unmanaged sidecar and the WebView is OS-dependent (Safari on macOS, WebView2 on Windows), which introduces rendering inconsistency. Electron wins on reliability here.

---

### What runs inside the app

```
[Electron main process]
  ├── spawns PyInstaller binary  →  FastAPI/uvicorn on localhost:8010
  ├── starts Next.js server.js   →  UI on localhost:3010
  └── opens BrowserWindow        →  http://localhost:3010
```

SQLite file lives at:
- macOS: `~/Library/Application Support/PayTracker/pay-tracker.db`
- Windows: `%APPDATA%\PayTracker\pay-tracker.db`
- Linux: `~/.config/PayTracker/pay-tracker.db`

---

### Platform support

| Platform | Supported | Artifact |
|----------|-----------|----------|
| macOS (arm64 + x64) | ✓ | `.dmg` (universal binary) |
| Windows (x64) | ✓ | `.exe` / `.msi` (NSIS installer) |
| Linux (x64) | ✓ | `.AppImage` |
| Android | ✗ | Requires full native rewrite — server-side process can't run on Android |
| iOS | ✗ | Same reason |

---

### Browser / OS notifications

The existing Web Push + service worker approach is replaced by Electron's native `Notification` API:

- `new Notification(title, options)` in the renderer triggers OS-level notifications (macOS Notification Center, Windows Action Center)
- Electron's main process reads reminder schedule from SQLite and uses `node-cron` (or `setTimeout`) to fire notifications — no push server needed
- Simpler and more reliable than Web Push for a local-only app
- The hourly reminder setting from the Settings page maps directly: on save, write schedule to SQLite; main process picks it up on next launch (or via IPC if the app is running)

---

### SMTP config — moving out of `.env`

`.env` is a dev-only mechanism. For the standalone app:

- **Config values** (host, port, from-address, username): stored in a `app_config` table in SQLite (or a `config.json` in the app data directory)
- **SMTP password**: stored in the OS keychain via `keytar` (Electron/Node.js library) — never plaintext on disk
- **Settings page** (already exists): add an "Email Notifications" section with fields for SMTP host, port, username, password. On save, backend writes to SQLite + keychain.
- `.env` continues to work for local Docker development; the standalone app ignores it entirely.

---

### Work breakdown

1. **SQLite migration** — swap PostgreSQL → SQLite in SQLAlchemy models, Alembic config, and connection string. Drop pg-specific types if any (JSONB → JSON, etc.).
2. **SMTP config** — add `app_config` table, move SMTP settings from `.env` to DB + keychain, extend Settings page UI.
3. **PyInstaller build** — spec file for the FastAPI backend; test that the binary boots cleanly without a virtualenv.
4. **Electron scaffold** — `main.js`: spawn backend binary, start `server.js`, open BrowserWindow, handle app quit (kill child processes).
5. **Notifications** — replace service worker push with `Notification` API + `node-cron` scheduler in main process; wire to reminder settings via IPC.
6. **electron-builder config** — `electron-builder.yml`: targets (dmg, nsis, AppImage), icons, app id, app data path.
7. **GitHub Actions release workflow** — matrix: `macos-latest` (universal), `windows-latest`, `ubuntu-latest`; triggers on `v*.*.*` tag; uploads artifacts to GitHub Release.
8. **macOS code signing + notarization** — requires Apple Developer account ($99/yr); Gatekeeper blocks unsigned apps since Catalina. Windows signing optional (SmartScreen warning without it).

---

### Decisions (planning complete — see plan-brief.md)

- **Architecture:** Keep two-process model (Next.js standalone server + PyInstaller FastAPI binary)
- **Platform:** macOS only for v1; Windows + Linux in a follow-up change
- **Auto-update:** Lightweight GitHub API checker (no code signing required); `electron-updater` deferred until Apple Developer account obtained
- **Code signing:** Deferred — personal use bypass via right-click → Open or `xattr -dr com.apple.quarantine`
