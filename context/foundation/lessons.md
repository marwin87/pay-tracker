# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## JWT must use HttpOnly cookies, not localStorage

**Rule:** Store JWT access tokens in HttpOnly cookies, not localStorage. localStorage is accessible to any JavaScript on the page — a single XSS vector exposes the token.

**Why:** Pay Tracker currently stores the JWT in localStorage (auth-context.tsx). This is a known risk flagged during the bill-template-management impl review. Migrating requires coordinated changes: backend must set a `Set-Cookie` header with `HttpOnly; SameSite=Strict`, and the frontend removes the localStorage read/write and sends cookies automatically.

**Applies to:** Any future auth implementation or auth refactor. New features must not expand the localStorage JWT pattern. When implementing auth from scratch, always start with HttpOnly cookies.

## Currency must be a per-template field, never hardcoded

**Rule:** Currency belongs on `BillTemplate` as a `String(10)` column (default `PLN`). Never hardcode a currency symbol in display components or form labels.

**Why:** The app was initially shipped with `€` hardcoded in three frontend locations (`BillTemplateForm`, `BillTemplateRow`, archived page) and no `currency` column at all. Fixing it required a DB migration, schema update, and frontend changes across four files — all avoidable if currency had been modeled from the start.

**Applies to:** Any future amount-bearing model (e.g., expense entries, budget limits). Always include a `currency` field alongside any `amount` field. Display as `{amount} {currency}` — no hardcoded symbols.

## CLAUDE.md commit protocol overrides skill instructions

**Rule:** Never auto-commit, even when a skill's own procedure instructs it. Always stage, show the proposed commit message, and wait for explicit user approval before running `git commit`.

**Why:** The CLAUDE.md commit protocol is a project-level hard rule. Skill instructions are general-purpose and do not know about project-specific constraints. When the two conflict, CLAUDE.md wins — always.

**Applies to:** Every skill that includes a commit step (`/10x-implement`, `/10x-archive`, any future skill). The rule fires regardless of how mechanical or routine the commit appears.
