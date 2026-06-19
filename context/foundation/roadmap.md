---
project: pay-tracker
version: 1
status: draft
created: 2026-06-11
updated: 2026-06-19
prd_version: 1
main_goal: low-complexity
top_blocker: none
---

# Roadmap: Pay Tracker

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Pay Tracker replaces the household spreadsheet with a web app that automates the
tedious, error-prone parts: each month's payment instance is generated automatically,
the dashboard shows what's upcoming and overdue at a glance, and family members can
mark bills paid from any device. Unlike subscription-based tools (YNAB, Mint), it
runs self-hosted or cloud-hosted with no third-party data sharing and no ongoing cost.
The two rules that distinguish it from a static spreadsheet are automatic status
classification (upcoming / overdue / paid) and automatic recurrence — when a payment
is marked paid, the next period's instance appears with no manual action.

## North star

**S-03: Core payment tracking loop** — the smallest end-to-end slice whose successful
delivery proves the core product hypothesis: create a bill template → see its instance
on the dashboard → mark it paid → watch next month's instance appear automatically,
with no manual intervention. This maps directly to the primary Success Criterion in
the PRD (US-01) and is placed as early as its prerequisites allow because every other
slice only matters if this loop works.

## At a glance

| ID   | Change ID                    | Outcome (user can …)                                                              | Prerequisites | PRD refs                                  | Status   |
| ---- | ---------------------------- | --------------------------------------------------------------------------------- | ------------- | ----------------------------------------- | -------- |
| F-01 | db-schema-migration          | (foundation) DB schema migrated to head; tables for users, bill_templates, payment_instances exist | — | NFR data-persistence                 | done     |
| S-01 | auth-ui                      | register and log in via the Next.js frontend                                      | F-01          | FR-001, FR-002                            | done     |
| S-02 | bill-template-management     | create, edit, and archive bill templates via UI                                   | S-01          | FR-003, FR-004, FR-005                    | done     |
| S-03 | core-payment-tracking-loop   | view payment instances by due date, mark them paid with amount override, and watch next month's instance auto-appear | S-01, S-02 | US-01, FR-006, FR-007, FR-008, FR-009 | done     |
| S-04 | xlsx-export                  | export payment history to a downloadable .xlsx spreadsheet file                   | S-01          | FR-010                                    | done     |
| S-05 | pwa-installability           | install the app from the browser on mobile and desktop                            | S-03          | FR-013                                    | done     |
| S-07 | language-support             | switch the UI between English and Polish; preference is saved per account and restored after login | S-01 | FR-016, FR-017                 | done     |
| S-08 | data-backup                  | download a full JSON backup of all templates and payment history                  | S-01          | FR-011                                    | done     |
| S-09 | data-restore                 | upload a JSON backup and restore all data from it                                 | S-08          | FR-018 (new)                              | done     |
| S-10 | email-reminders              | receive an email reminder before bills become overdue                             | S-03          | FR-012                                    | done     |
| S-11 | per-user-data-scoping        | only see own bills and payments; User A cannot access User B's data               | F-01, S-01    | FR-020 (new — security, blocking)         | done     |
| S-12 | browser-notification         | get a browser notification for each unpaid bill due today when opening the dashboard | S-05       | FR-013 (extension)                        | done     |
| S-13 | settings-page                | manage user profile, email/browser notification preferences, and backup/restore from a dedicated Settings page | S-10, S-12 | FR-001, FR-011, FR-012, FR-013, FR-018    | done     |
| S-14 | standalone-electron-app      | install Pay Tracker as a native desktop app (macOS, Windows, Linux) — no Docker, no browser, no server setup required | S-13 | NFR deploy                               | new      |
| S-15 | category-enum-grouping       | see bills and payments grouped by a predefined category (Housing, Utilities, Subscriptions, etc.); category is required on every bill | S-02, S-07 | FR-003, FR-005                  | planned  |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                  | Chain                                      | Note                                                                                                               |
| ------ | ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| A      | Core tracking loop     | `F-01` → `S-01` → `S-02` → `S-03`         | The must-have path to the north star; every other stream branches off this one.                                    |
| B      | Data portability       | `S-01` → `S-04` → `S-08` → `S-09`         | S-04 (.xlsx) and S-08 (backup) parallel with S-02; S-09 (import) needs S-08 first.                                |
| C      | Ship & deploy          | `S-03` → `S-05`                            | Runs after the north star lands.                                                                                   |
| D      | Localisation           | `S-01` → `S-07`                            | Independent of the core loop; can run in parallel with any other stream after S-01.                               |
| E      | Notifications          | `S-03` → `S-10` · `S-05` → `S-12`         | S-10: email reminders, needs SMTP config. S-12: browser push on due date, client-side only, needs PWA SW.         |
| F      | Security (blocking)    | `F-01` → `S-01` → `S-11`                  | Breaking schema change. Must land before S-09 (restore) — user-scoped restore depends on user-scoped data model.  |

## Baseline

What's already in place in the codebase as of 2026-06-11 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Next.js 16.2.9 + React 19.2.4, App Router, Tailwind CSS; boilerplate only, no reusable components (`frontend/src/app/`)
- **Backend / API:** present — FastAPI with routers for auth, bills, and export (`backend/app/routers/`); entrypoint at `backend/app/main.py`
- **Data:** partial — SQLAlchemy 2.0 models for users and bills (`backend/app/models/`), Alembic configured but migrations folder empty; no migration revision generated yet
- **Auth:** present — custom JWT auth (PyJWT); token creation at `backend/app/core/security.py:19-27`; route protection via `Depends(current_user)` in `backend/app/core/deps.py:13-24`; all bill routes protected
- **Deploy / infra:** partial — `docker-compose.yml` + `frontend/Dockerfile` + `backend/Dockerfile` present; no CI/CD workflows
- **Observability:** absent — no logging library, no error tracking, no metrics configured

## Foundations

### F-01: DB schema migration

- **Outcome:** (foundation) Alembic revision generated and applied; tables for `users`, `bill_templates`, and `payment_instances` exist in the containerized PostgreSQL instance.
- **Change ID:** db-schema-migration
- **PRD refs:** NFR data-persistence ("all payment data is written to a durable database")
- **Unlocks:** S-01 (users table needed for registration), S-02 (bill_templates table needed for template CRUD), S-03 (payment_instances table needed for the tracking loop), S-04 (data must exist to export)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every vertical slice is unverifiable without the schema in place. Risk: SQLAlchemy models may not yet cover all columns implied by the business-logic rules (e.g., `paused` flag, `period` key on instances); the migration step will surface any model gaps before UI work begins.
- **Status:** done

## Slices

### S-01: Auth UI

- **Outcome:** user can register with email and password and log in via the Next.js frontend; a valid JWT is stored in the browser and sent on subsequent API calls.
- **Change ID:** auth-ui
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** F-01 (users table must exist)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Backend auth is fully wired (JWT issuance, route protection); this slice is frontend-only — register page, login page, token storage, and redirect guard. Low risk. Sequenced before template and payment work because every other slice requires an authenticated session.
- **Status:** done

---

### S-02: Bill template management

- **Outcome:** user can create a bill template (name, amount, category, due day, recurrence type, paused flag), edit an existing template, and archive one (hidden from active view; history preserved).
- **Change ID:** bill-template-management
- **PRD refs:** FR-003, FR-004, FR-005
- **Prerequisites:** S-01 (authenticated session required to call template API)
- **Parallel with:** S-04 (export backend already exists; export frontend can be built alongside template UI)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Backend bills router is already scaffolded (`backend/app/routers/bills.py`, 112 lines); this slice is primarily a frontend CRUD form and list. Sequenced before the payment loop (S-03) because instances cannot be generated without templates. Main risk: the "paused" flag and "archive" soft-delete semantics must be wired consistently between model, API, and UI — an inconsistency here would break FR-009 suppression logic downstream.
- **Status:** done

---

### S-03: Core payment tracking loop *(north star)*

- **Outcome:** user can view a unified payment list sorted by due date with status indicators (upcoming / overdue / paid), mark a payment instance as paid with the amount defaulting to the template amount (overridable), and watch the next month's instance appear automatically on the dashboard — with no manual action required.
- **Change ID:** core-payment-tracking-loop
- **PRD refs:** US-01, FR-006, FR-007, FR-008, FR-009
- **Prerequisites:** S-01 (auth), S-02 (templates must exist for instances to be generated)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Does `backend/app/services/recurrence.py` already implement FR-006 (idempotent instance generation) and FR-009 (auto-create next period on paid)? — Owner: user. Block: no (planning can proceed; implementation will read the file and complete or extend it).
- **Risk:** This is the most complex slice — it exercises the two domain rules simultaneously (status classification + recurrence automation). The idempotency key `(bill_id, period)` must be enforced at the DB constraint level to prevent duplicate instances at month boundaries (see AGENTS.md hard rule). Sequenced after template management because instances are derived from templates.
- **Status:** done

---

### S-04: .xlsx export

- **Outcome:** user can export all payment history to a downloadable `.xlsx` spreadsheet file directly from the dashboard.
- **Change ID:** xlsx-export
- **PRD refs:** FR-010
- **Prerequisites:** S-01 (authenticated session required to access export endpoints)
- **Parallel with:** S-02, S-08 (backend export router already exists at `backend/app/routers/export.py`; frontend trigger is the only remaining work)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Backend export is already scaffolded; this slice adds the frontend download button and verifies the `.xlsx` output is correct and complete. Low risk.
- **Status:** done

---

### S-05: PWA installability

- **Outcome:** user can install the app from the browser as a Progressive Web App on both mobile and desktop; all primary views are fully operable on 375px-wide screens without pinch-zoom.
- **Change ID:** pwa-installability
- **PRD refs:** FR-013
- **Prerequisites:** S-03 (the core app must be functional before PWA installation is meaningful to verify)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Local-mode PWA requires HTTPS; self-hosted deployments need a reverse-proxy or self-signed cert. Guidance deferred to deployment docs. — Owner: implementation team. Block: no (does not affect core PWA configuration).
- **Risk:** Next.js supports PWA via `next-pwa` or a custom service worker; the manifest and service worker are configuration work. Mobile usability (375px layouts) should be addressed incrementally during S-01–S-04 but final verification is here. Low risk if layouts are kept simple throughout.
- **Status:** done

---

### S-07: Language support

- **Outcome:** user can switch the UI between English and Polish via a toggle in the dashboard nav bar; the selected language is detected automatically from the browser on first use and restored from the user's account on subsequent logins.
- **Change ID:** language-support
- **PRD refs:** FR-016, FR-017
- **Prerequisites:** S-01 (per-user persistence requires auth and a `/auth/me` endpoint built on the existing JWT infrastructure)
- **Parallel with:** S-02, S-03, S-04, S-05, S-06 — no data dependencies on any other slice
- **Blockers:** —
- **Unknowns:** —
- **Risk:** All ~80 user-visible strings must be extracted from 13 files; a missing translation key causes a runtime error in next-intl, so message files must be complete before Phase 3 ships. Plan is at `context/changes/language-support/plan.md`.
- **Status:** done

---

### S-08: JSON backup

- **Outcome:** user can download a full machine-readable JSON backup of all bill templates and payment history from the dashboard.
- **Change ID:** data-backup
- **PRD refs:** FR-011
- **Prerequisites:** S-01 (authenticated session required)
- **Parallel with:** S-04 (both use the existing export router; can be built in the same pass or separately)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Backend endpoint may already be scaffolded in `export.py`; verify coverage before planning. Low risk.
- **Status:** done

---

### S-11: Per-user data scoping *(security — blocking)*

- **Outcome:** each user can only see and manage their own bill templates and payment instances; User A cannot read, create, update, or delete User B's data under any circumstance.
- **Change ID:** per-user-data-scoping
- **PRD refs:** FR-020
- **Prerequisites:** F-01 (schema), S-01 (auth / `current_user`)
- **Parallel with:** nothing — this is a breaking schema change; all bill/payment work is blocked until this lands
- **Blockers:** —
- **Unknowns:**
  - Migration strategy for existing rows — existing `BillTemplate` rows have no `user_id`. The migration must either assign them to a single owner or truncate. Decision must be made during planning. — Owner: user. Block: yes (migration cannot run without this decision).
- **Risk:** Breaking change. Requires: (1) Alembic migration to add non-nullable `user_id` FK on `BillTemplate`; (2) all bill router queries filtered by `current_user.id`; (3) all export/backup endpoints scoped to `current_user.id`; (4) recurrence service must never touch another user's templates. A missed filter is a data-leak bug — each router endpoint must be audited individually. PaymentInstance does NOT need a direct `user_id` column — scope is inherited transitively via `bill_id → BillTemplate.user_id`.
- **Status:** done

---

### S-09: Restore from backup file

- **Outcome:** user can upload a JSON backup file and restore all bill templates and payment history from it; existing data is replaced or merged (strategy TBD at plan time).
- **Change ID:** data-restore
- **PRD refs:** FR-018 (new — add to PRD)
- **Prerequisites:** S-08 (backup format must be stable before import can be implemented)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Replace-all vs. merge strategy — destructive restore resets the DB; merge strategy preserves existing records. Must be decided during `/10x-plan data-restore`. — Owner: user. Block: no (planning can proceed with both options on the table).
  - Auth guard for import — import is a destructive admin-level action; must confirm whether the existing `current_user` dependency is sufficient or a confirmation step is needed.
- **Risk:** Most complex of the three data-portability slices. A destructive import without adequate confirmation or a transaction rollback path could result in data loss. Plan must include a dry-run or confirmation gate.
- **Status:** done

---

### S-12: Browser notifications

- **Outcome:** user gets one browser notification per unpaid bill due today each time the dashboard is opened; notifications require one-time permission grant via a Bell icon in the dashboard header.
- **Change ID:** browser-notification
- **PRD refs:** FR-013 (extension — PWA notification capability)
- **Prerequisites:** S-05 (service worker must be registered for `showNotification()`)
- **Parallel with:** S-10 (independent notification channel; no shared dependencies)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Client-side only; no backend changes. iOS requires app installed as PWA (Add to Home Screen) and iOS 16.4+ — silently no-ops on older versions. Dedup via localStorage so repeated page loads don't spam the user. Low risk overall.
- **Status:** done

---

### S-10: Email reminders

- **Outcome:** user receives an email reminder N days before a bill's due date when the instance is still unpaid; the lead time is configurable per template or globally.
- **Change ID:** email-reminders
- **PRD refs:** FR-012
- **Prerequisites:** S-03 (payment instances must exist to trigger reminders)
- **Parallel with:** S-04, S-08, S-09 (no data dependencies on export/import)
- **Blockers:** SMTP provider and credentials must be configured in the deployment environment before this slice can be verified end-to-end.
- **Unknowns:**
  - SMTP provider — Resend, SendGrid, Mailgun, or self-hosted (Postfix). Choice affects the backend library and credential format. Must be decided before `/10x-plan email-reminders`. — Owner: user. Block: no (implementation can be provider-agnostic via SMTP; provider is a deployment concern).
  - Reminder timing — how many days before due date? Fixed value (e.g., 3 days) or per-template setting? — Owner: user. Block: no (default to a fixed configurable value; per-template setting can be added later).
  - Delivery mechanism — a scheduled background job (APScheduler or a cron container) or a queue (Celery + Redis). Scheduled job is simpler; queue is more robust under load. — Owner: implementation team. Block: no (APScheduler embedded in FastAPI is sufficient for a household-scale app).
- **Risk:** Adds a background scheduler and an external SMTP dependency — both are new infrastructure for this project. Main risk is silent delivery failures (bounces, spam filtering) that are hard to detect without logging or a delivery webhook. Plan must include a delivery log table or at minimum structured logging per send attempt.
- **Status:** done

---

### S-13: Settings page

- **Outcome:** user can manage their account (email, password), configure email reminder timing (2 days before / 1 day before / on day / 1 day after), enable/disable browser notifications, and trigger backup and restore — all from a single dedicated Settings page accessible via a gear icon in the nav header. The crowded header icon buttons are removed.
- **Change ID:** settings-page
- **PRD refs:** FR-001 (profile), FR-011 (backup), FR-012 (email reminders), FR-013 (browser notifications), FR-018 (restore)
- **Prerequisites:** S-10 (email reminder infrastructure), S-12 (browser notification hook)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **TODO (impl-review follow-up):** Wire a master "Enable email reminders" toggle UI on the settings page — a checkbox or switch bound to `email_reminders_enabled` that calls `updateMe({ email_reminders_enabled })`. The backend field and scheduler filter are now correctly wired (impl-review fix, 2026-06-16); only the settings page UI toggle remains.
- **Risk:** Email reminder timing adds 4 new User model columns and tightens the `reminder_sent_overdue` semantics from "any overdue" to "exactly 1 day after due" — a behavioral change for existing users. Migration defaults `notify_1_day_before = True` to preserve prior behavior. Plan at `context/changes/settings-page/plan.md`.
- **Status:** done

---

### S-15: Category enum & grouping

- **Outcome:** user sees bills (active and archived) and payments grouped under predefined category headers (Housing, Utilities, Insurance, Subscriptions, Entertainment, Transport, Healthcare, Education, Other); category is a required field on every bill template, selected from a fixed `<select>` instead of a free-text input.
- **Change ID:** category-enum-grouping
- **PRD refs:** FR-003, FR-005 (bill template management — category field)
- **Prerequisites:** S-02 (bill templates must exist), S-07 (i18n infrastructure required for translated category labels)
- **Parallel with:** S-14 (no dependencies)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Requires a hand-written Alembic migration (per lessons.md — autogenerate is unreliable for column type/nullability changes); the migration promotes `category` from nullable `VARCHAR(100)` to `NOT NULL VARCHAR(50)`. Old backup files with free-text category strings are handled gracefully (coerced to `"other"` on restore). Plan at `context/changes/category-enum-grouping/plan.md`.
- **Status:** planned

---

### S-14: Standalone Electron desktop app

- **Outcome:** user can download a single installer (`.dmg` on macOS, `.exe` on Windows, `.AppImage` on Linux), install Pay Tracker like any native app, and run it with no Docker, no Node.js, no Python, and no manual server setup. Data persists in a SQLite file in the OS standard app-data directory. OS-level notifications replace the browser push setup. SMTP credentials move from `.env` into the Settings page and are stored securely in the OS keychain.
- **Change ID:** standalone-electron-app
- **PRD refs:** NFR deploy (self-hosted, no third-party dependency)
- **Prerequisites:** S-13 (all features must be complete and stable before packaging; Settings page is extended with SMTP config UI)
- **Parallel with:** —
- **Blockers:** Apple Developer account required for macOS notarization ($99/yr); unsigned builds are blocked by Gatekeeper on Catalina+.
- **Unknowns:**
  - Single-process vs. two-process: collapse Next.js + FastAPI into one process (FastAPI serves static files) or keep them separate and orchestrate from Electron main? Collapsing removes one subprocess; separate processes map cleanly to the existing architecture. — Owner: user. Block: no (planning can proceed with both on the table).
  - Auto-update: include `electron-updater` (checks GitHub Releases automatically) or ship manual updates only? — Owner: user. Block: no.
  - macOS-only first or all three platforms (macOS + Windows + Linux) from day one? — Owner: user. Block: no.
- **Risk:** Electron bundles Chromium — installer will be ~200–350 MB. PyInstaller binary must be tested on a clean machine (no Python installed) to catch missing shared libraries. macOS notarization adds CI complexity. SQLite migration is a prerequisite and is the largest code change in this slice.
- **Architecture summary:**
  - PostgreSQL → SQLite (SQLAlchemy supports it; Alembic migration required)
  - Electron main process spawns PyInstaller backend binary + Next.js `server.js`; opens `BrowserWindow` at `localhost:3010`
  - Notifications: `new Notification()` in renderer → OS notification center; `node-cron` in main process replaces the browser push/service worker approach
  - SMTP password: stored via `keytar` in OS keychain; SMTP host/port/username in SQLite `app_config` table
  - Release artifacts built by `electron-builder` on GitHub Actions matrix (macos-latest universal, windows-latest, ubuntu-latest); published to GitHub Release on `v*.*.*` tag push
- **Platform support:** macOS ✓ · Windows ✓ · Linux ✓ · Android ✗ · iOS ✗
- **Status:** new

---

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                          |
| ---------- | -------------------------- | ------------------------------------------------------------ | --------------------- | ---------------------------------------------- |
| F-01       | db-schema-migration        | Generate and apply initial Alembic DB migration              | yes                   | Run `/10x-plan db-schema-migration`            |
| S-01       | auth-ui                    | Frontend auth: register and login pages                      | no                    | Needs F-01 done first                          |
| S-02       | bill-template-management   | Frontend: create, edit, and archive bill templates           | no                    | Needs S-01 done first                          |
| S-03       | core-payment-tracking-loop | Frontend + backend: payment list, mark paid, auto-recurrence | no                    | Needs S-01, S-02 done first                    |
| S-04       | xlsx-export                | Frontend: .xlsx export download button                       | yes                   | Backend already scaffolded; frontend trigger only |
| S-05       | pwa-installability         | PWA manifest, service worker, 375px layout verification      | no                    | Needs S-03 done first                          |
| S-07       | language-support           | EN/PL i18n: next-intl, language toggle, per-user persistence | yes                   | Plan ready; run `/10x-implement language-support phase 1` |
| S-08       | data-backup                | Frontend: JSON backup download                               | yes                   | Backend may already be scaffolded; verify first   |
| S-09       | data-restore               | Backend + frontend: upload and restore from JSON backup      | no                    | Needs S-08 + S-11 done; define replace vs. merge strategy first   |
| S-10       | email-reminders            | Backend scheduler + email: overdue reminders via SMTP        | no                    | Needs S-03 done; SMTP provider and lead-time must be decided first |
| S-12       | browser-notification       | Bell icon + browser notification for bills due today         | yes                   | Plan ready; run `/10x-implement browser-notification phase 1` |
| S-11       | per-user-data-scoping      | Add user_id FK to bill_templates; scope all queries to current_user | yes             | **Security/blocking.** Decide migration strategy for existing rows first. |
| S-13       | settings-page              | Settings page: profile, email notification timing, browser notifications, backup/restore | yes | Plan ready; run `/10x-implement settings-page phase 1` |
| S-15       | category-enum-grouping     | Promote category to enum, group bills and payments by category               | yes | Plan written; run `/10x-implement category-enum-grouping phase 1` |
| S-14       | standalone-electron-app    | Package Pay Tracker as a native Electron desktop app (macOS, Windows, Linux) | no | Needs S-13 done; resolve SQLite migration + open questions before `/10x-plan standalone-electron-app` |

## Open Roadmap Questions

1. **Local-mode PWA and HTTPS** — A self-hosted deployment without HTTPS cannot install as a PWA on most browsers. A reverse-proxy or certificate setup guide is needed in deployment documentation. — Owner: implementation team. Block: S-05 (no — does not affect core PWA config or cloud-mode installability).

## Parked

- **CI/CD pipeline** — Shipped 2026-06-15. GitHub Actions workflow at `.github/workflows/ci.yml`: frontend build + lint, backend black format check, backend tests placeholder, Docker smoke test (build → up → health check → down). Not an FR; infrastructure polish.
- **Budgeting and savings goals** — Why parked: PRD §Non-Goals. Out of scope for v1.
- **Bank / card integrations** — Why parked: PRD §Non-Goals. No automatic transaction import of any kind.
- **Multi-household / SaaS mode** — Why parked: PRD §Non-Goals. One household per deployment instance.
- **Native mobile app** — Why parked: PRD §Non-Goals. PWA is the mobile story.

## Done

- **F-01: (foundation) DB schema migrated to head; tables for users, bill_templates, payment_instances exist** — Archived 2026-06-11 → `context/archive/2026-06-11-db-schema-migration/`. Lesson: —.
- **S-01: user can register with email and password and log in via the Next.js frontend; a valid JWT is stored in the browser and sent on subsequent API calls.** — Archived 2026-06-12 → `context/archive/2026-06-12-auth-ui/`. Lesson: —.
- **S-02: create, edit, and archive bill templates via UI** — Archived 2026-06-12 → `context/archive/2026-06-12-bill-template-management/`. Lesson: —.
- **S-07: user can switch the UI between English and Polish via a toggle in the dashboard nav bar; the selected language is detected automatically from the browser on first use and restored from the user's account on subsequent logins.** — Archived 2026-06-12 → `context/archive/2026-06-12-language-support/`. Lesson: —.
- **S-03: user can view a unified payment list sorted by due date with status indicators (upcoming / overdue / paid), mark a payment instance as paid with the amount defaulting to the template amount (overridable), and watch the next month's instance appear automatically on the dashboard** — Archived 2026-06-12 → `context/archive/2026-06-12-core-payment-tracking-loop/`. Lesson: —.
- **S-04: user can export all payment history to a downloadable .xlsx spreadsheet file directly from the dashboard** — Archived 2026-06-15 → `context/archive/2026-06-13-xlsx-export/`. Lesson: —.
- **S-05: install the app from the browser on mobile and desktop** — Archived 2026-06-15 → `context/archive/2026-06-15-pwa-installability/`. Lesson: —.
- **S-08: download a full JSON backup of all templates and payment history** — Archived 2026-06-15 → `context/archive/2026-06-15-data-backup/`. Lesson: —.
- **S-11: only see own bills and payments; User A cannot access User B's data** — Archived 2026-06-15 → `context/archive/2026-06-15-per-user-data-scoping/`. Lesson: —.
- **S-09: upload a JSON backup and restore all data from it** — Archived 2026-06-15 → `context/archive/2026-06-15-data-restore/`. Lesson: —.
- **S-12: user gets one browser notification per unpaid bill due today each time the dashboard is opened; notifications require one-time permission grant via a Bell icon in the dashboard header.** — Archived 2026-06-15 → `context/archive/2026-06-15-browser-notification/`. Lesson: —.
- **S-10: user receives an email reminder N days before a bill's due date when the instance is still unpaid; the lead time is configurable per template or globally.** — Archived 2026-06-16 → `context/archive/2026-06-16-email-reminders/`. Lesson: —.
- **S-13: user can manage their account (email, password), configure email reminder timing (2 days before / 1 day before / on day / 1 day after), enable/disable browser notifications, and trigger backup and restore — all from a single dedicated Settings page accessible via a gear icon in the nav header. The crowded header icon buttons are removed.** — Archived 2026-06-16 → `context/archive/2026-06-16-settings-page/`. Lesson: —.
