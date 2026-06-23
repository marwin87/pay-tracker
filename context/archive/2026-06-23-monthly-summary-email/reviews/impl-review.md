<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Monthly Summary Email

- **Plan**: context/changes/monthly-summary-email/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-23
- **Verdict**: NEEDS ATTENTION → resolved to APPROVED after triage
- **Findings**: 0 critical | 2 warnings | 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING (intentional UI reorder at user's direction) |
| Scope Discipline | PASS |
| Safety & Quality | WARNING → FIXED |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (automated); manual pending |

## Findings

### F1 — User-controlled strings not HTML-escaped in summary email

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/email.py ~line 231
- **Detail**: Bill names, due dates, paid_at from DB interpolated raw into HTML email. Self-XSS only (same user sends and receives), but violates HTML generation best practice.
- **Fix**: Added `import html` and wrapped `row["name"]`, `row["due_date"]`, `paid_on`, and `month_label` with `html.escape()` in `_build_summary_html`. Amount values from `fmt_amount()` (Decimal-derived) are safe as-is.
- **Decision**: FIXED

### F2 — send_monthly_summary_for_user passes smtp_host=None unchecked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/reminder_job.py ~line 69
- **Detail**: Function called smtplib with smtp_host=None if SMTP unconfigured. socket.gaierror not caught by `except smtplib.SMTPException`. Current callers guarded externally but defensive programming required.
- **Fix**: Added `if not settings.smtp_host: return False` at top of `send_monthly_summary_for_user`.
- **Decision**: FIXED

### F3 — Duplicate monthly email possible if scheduler fires twice concurrently

- **Severity**: 👀 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/services/reminder_job.py ~lines 229–245
- **Detail**: Query-then-flag pattern not atomic; two concurrent scheduler fires could both see NULL and both send. Acceptable at household scale with 30-min cadence.
- **Fix**: Added inline comment acknowledging the race window in both `send_daily_reminders` and (implicitly) `send_catchup_reminders`.
- **Decision**: FIXED (comment added)

### F4 — SMTP error test covers only SMTPException, not socket errors

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: backend/tests/test_reminder_job.py ~line 320
- **Detail**: After F2 fix, the smtp_host=None guard was untested.
- **Fix**: Added `test_monthly_summary_returns_false_when_smtp_not_configured` — mocks settings.smtp_host=None, asserts False returned.
- **Decision**: FIXED

### F5 — Migration uses non-idiomatic server_default=sa.text("null")

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/alembic/versions/bcd40842a95d…py ~line 36
- **Detail**: `server_default=sa.text("null")` valid but non-idiomatic; already applied so no migration change needed.
- **Fix**: Recorded as lesson in context/foundation/lessons.md ("Alembic: omit server_default on nullable columns").
- **Decision**: ACCEPTED-AS-RULE: omit server_default on nullable columns

## Toggle Placement Note

Plan specified toggle after 4 timing checkboxes; actual placement groups toggle with summary button below send-now button. This was an explicit mid-implementation user directive. Recorded as intentional UI reorder, not a defect.
