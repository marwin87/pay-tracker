---
project: pay-tracker
phase: "Phase 5 — macOS packaging (.app build)"
status: paused
updated: 2026-07-26
blocked_on: xcode-install
---

# Phase 5: macOS packaging — status

> Part of the Flet native-app rewrite (see the approved plan for the full Phase 1-6
> breakdown; Phases 1-4 are done — data layer, Payments/Bills UI, backup/restore +
> settings, macOS menu-bar reminders). This file tracks Phase 5 specifically:
> producing a real, installable `.app` bundle. **Paused** — picked back up whenever
> Xcode is installed.

## Goal

Run `flet build macos` to turn `app/main.py` + `app/paytracker/` into a standalone
`.app` bundle that runs without `uv`/a Python venv on the machine, verify it survives
a right-click-to-open Gatekeeper bypass (unsigned build, no Apple Developer ID — by
design, see the approved plan), and confirm a rebuild never destroys the local SQLite
data file.

## Done

- **Dependencies pinned** in `app/pyproject.toml` — `flet==0.86.2`,
  `sqlalchemy==2.0.51`, `openpyxl==3.1.5`, `pandas==3.0.5` (previously loose
  `>=` constraints). `uv lock` re-run to match. Prevents a future `uv sync`/rebuild
  from silently pulling a breaking dependency update.
- **App icon generated** — `app/assets/icon.png`, 1024×1024, derived from the
  existing `pt-logo.png` via `sips -z 1024 1024`. Flet's build pipeline
  auto-discovers `assets/icon.png` (with per-platform overrides like
  `icon_macos.png` if ever needed) and generates the `.icns` itself — no manual
  icon-set work required.
- **Build metadata added** to `app/pyproject.toml`:
  ```toml
  [tool.flet]
  product = "Pay Tracker"
  org = "com.paytracker"
  company = "Pay Tracker"
  build_number = 1
  ```
  `build_number`/`build_version` — build_version is read automatically from
  `[project].version` (currently `0.1.0`); no extra config needed there.

## Blocked

**`flet build macos` fails — Xcode is not fully installed.**

```
$ xcode-select -p
/Library/Developer/CommandLineTools
```

Only the Command Line Tools are present. Building a real macOS `.app` (the
`xcodebuild` step Flutter/Flet shells out to) requires the **full Xcode app**,
not just CLT. Confirmed by directly reproducing the failure:

```
xcrun: error: unable to find utility "xcodebuild", not a developer tool or in PATH
```

### To unblock

1. Install Xcode from the App Store (several GB — budget time for the download).
2. Run:
   ```
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -runFirstLaunch
   ```
3. Re-run `flet build macos --build-number 1 --yes` from `app/`.

Two other `flutter doctor` warnings surfaced during the failed run — **not
blockers**, listed here so they're not mistaken for new problems next time:

- No Android SDK — irrelevant, this build targets macOS only, not Android.
- No CocoaPods — only needed for native iOS/macOS plugins with pod
  dependencies; this app has none.

## Remaining after unblock (not started)

1. Re-run `flet build macos` — first run after Xcode is installed will also
   download the Flutter SDK (~1-2GB, one-time); expect 10-25 minutes total for
   this first build, ~2-5 minutes for subsequent rebuilds.
2. **Gatekeeper check** — right-click → Open on the built `.app` on first
   launch, confirm it opens cleanly (unsigned-build bypass, by design — no
   Apple Developer ID for a personal-use app).
3. **Data-survival check** (the one that actually matters) — build the app,
   run it, create some bills/payments, rebuild with a trivial change,
   reinstall, confirm `~/Library/Application Support/PayTracker/paytracker.db`
   and its data are untouched and `run_migrations()` still fires correctly
   against the *existing* file. Same discipline that mattered for the earlier
   `theme_mode` migration bug — packaging changes must never silently blow
   away real data.
4. **Exit check** — copy the built `.app` to `/Applications`, launch it from
   there (not from the build output folder), walk Payments → Bills →
   Settings → Backup/Restore → Reminders end-to-end as a real user would.
