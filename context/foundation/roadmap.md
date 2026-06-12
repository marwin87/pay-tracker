---
project: pay-tracker
version: 1
status: draft
created: 2026-06-11
updated: 2026-06-12
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
| S-04 | xlsx-export                  | export payment history to a downloadable .xlsx spreadsheet file                   | S-01          | FR-010                                    | proposed |
| S-05 | pwa-installability           | install the app from the browser on mobile and desktop in both deployment modes   | S-03          | FR-013                                    | proposed |
| S-06 | dual-deployment-modes        | run the app identically in local Docker Compose mode and cloud-hosted mode via env-var switching | S-03 | FR-014, FR-015                  | proposed |
| S-07 | language-support             | switch the UI between English and Polish; preference is saved per account and restored after login | S-01 | FR-016, FR-017                 | done     |
| S-08 | data-backup                  | download a full JSON backup of all templates and payment history                  | S-01          | FR-011                                    | proposed |
| S-09 | data-import                  | upload a JSON backup and restore all data from it                                 | S-08          | FR-018 (new)                              | proposed |
| S-10 | email-reminders              | receive an email reminder before bills become overdue                             | S-03          | FR-012                                    | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                  | Chain                                      | Note                                                                                  |
| ------ | ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| A      | Core tracking loop     | `F-01` → `S-01` → `S-02` → `S-03`         | The must-have path to the north star; every other stream branches off this one.       |
| B      | Data portability       | `S-01` → `S-04` → `S-08` → `S-09`         | S-04 (.xlsx) and S-08 (backup) parallel with S-02; S-09 (import) needs S-08 first. |
| C      | Ship & deploy          | `S-03` → `S-05` / `S-06`                  | Both run after the north star lands; S-05 and S-06 are parallel with each other.      |
| D      | Localisation           | `S-01` → `S-07`                            | Independent of the core loop; can run in parallel with any other stream after S-01.   |
| E      | Notifications          | `S-03` → `S-10`                            | Needs the core loop so there are real overdue events to notify about; SMTP config required. |

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
- **Status:** proposed

---

### S-05: PWA installability

- **Outcome:** user can install the app from the browser as a Progressive Web App on both mobile and desktop, in both deployment modes; all primary views are fully operable on 375px-wide screens without pinch-zoom.
- **Change ID:** pwa-installability
- **PRD refs:** FR-013
- **Prerequisites:** S-03 (the core app must be functional before PWA installation is meaningful to verify)
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:**
  - Local-mode PWA requires HTTPS; self-hosted deployments need a reverse-proxy or self-signed cert. Guidance deferred to deployment docs. — Owner: implementation team. Block: no (does not affect core PWA configuration or the app's installability in cloud mode).
- **Risk:** Next.js supports PWA via `next-pwa` or a custom service worker; the manifest and service worker are configuration work. Mobile usability (375px layouts) should be addressed incrementally during S-01–S-04 but final verification is here. Low risk if layouts are kept simple throughout.
- **Status:** proposed

---

### S-06: Dual deployment modes

- **Outcome:** the app runs identically in local Docker Compose mode (`DEPLOY_MODE=LOCAL`, FastAPI JWT auth, PostgreSQL) and in cloud-hosted mode (`DEPLOY_MODE=CLOUD`, Supabase auth + RLS) with no code changes — only environment variable differences.
- **Change ID:** dual-deployment-modes
- **PRD refs:** FR-014, FR-015
- **Prerequisites:** S-03 (the full core loop must work in local mode before cloud mode can be verified)
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - Cloud mode requires a Supabase project to be provisioned and credentials configured. — Owner: user. Block: no (local mode ships first; cloud verification can be scheduled once a Supabase project exists).
- **Risk:** DEPLOY_MODE switching is already an architectural commitment (AGENTS.md hard rule: no DEPLOY_MODE-specific logic in new code; env vars only). The risk is that some code path written during S-01–S-03 inadvertently introduces mode-specific branching. Sequenced last so the full app is exercised in local mode before cloud compatibility is tested.
- **Status:** proposed

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
- **Status:** proposed

---

### S-09: Import from backup

- **Outcome:** user can upload a JSON backup file and restore all bill templates and payment history from it; existing data is replaced or merged (strategy TBD at plan time).
- **Change ID:** data-import
- **PRD refs:** FR-018 (new — add to PRD)
- **Prerequisites:** S-08 (backup format must be stable before import can be implemented)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Replace-all vs. merge strategy — destructive restore resets the DB; merge strategy preserves existing records. Must be decided during `/10x-plan data-import`. — Owner: user. Block: no (planning can proceed with both options on the table).
  - Auth guard for import — import is a destructive admin-level action; must confirm whether the existing `current_user` dependency is sufficient or a confirmation step is needed.
- **Risk:** Most complex of the three data-portability slices. A destructive import without adequate confirmation or a transaction rollback path could result in data loss. Plan must include a dry-run or confirmation gate.
- **Status:** proposed

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
- **Status:** proposed

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
| S-06       | dual-deployment-modes      | Verify local + cloud env-var switching end-to-end            | no                    | Needs S-03 done; Supabase project required     |
| S-07       | language-support           | EN/PL i18n: next-intl, language toggle, per-user persistence | yes                   | Plan ready; run `/10x-implement language-support phase 1` |
| S-08       | data-backup                | Frontend: JSON backup download                               | yes                   | Backend may already be scaffolded; verify first   |
| S-09       | data-import                | Backend + frontend: upload and restore from JSON backup      | no                    | Needs S-08 done; define replace vs. merge strategy first |
| S-10       | email-reminders            | Backend scheduler + email: overdue reminders via SMTP        | no                    | Needs S-03 done; SMTP provider and lead-time must be decided first |

## Open Roadmap Questions

1. **Local-mode PWA and HTTPS** — A self-hosted deployment without HTTPS cannot install as a PWA on most browsers. A reverse-proxy or certificate setup guide is needed in deployment documentation. — Owner: implementation team. Block: S-05 (no — does not affect core PWA config or cloud-mode installability).

## Parked

- **CI/CD pipeline** — Why parked: no CI/CD workflow exists yet; not an FR; tech-stack.md names GitHub Actions but this is infrastructure polish. Add after the first working end-to-end deployment is confirmed.
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
