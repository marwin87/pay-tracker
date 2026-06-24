<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Reset Password

- **Plan**: context/changes/reset-password/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-24
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical, 1 warning, 4 observations — all fixed

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING → FIXED |
| Architecture | PASS |
| Pattern Consistency | WARNING → FIXED |
| Success Criteria | PASS |

## Findings

### F1 — SMTP exception leaks email enumeration

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/app/routers/auth.py ~line 220
- **Detail**: When SMTP fails after token committed, 500 propagates — known email returns 500 vs unknown email returns 200, leaking existence.
- **Fix**: Wrapped send_password_reset_email in try/except, log via _logger.exception, always return _FORGOT_PASSWORD_RESPONSE.
- **Decision**: FIXED

### F2 — Wrong i18n key in forgot-password error catch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: frontend/src/app/forgot-password/page.tsx line 32
- **Detail**: catch block used t("registrationFailed") — showed "Registration failed" on network error.
- **Fix**: Added Auth.forgotPasswordFailed key to all three locale files; updated component to use t("forgotPasswordFailed").
- **Decision**: FIXED

### F3 — Hardcoded "1 hour" in reset email body copy

- **Severity**: 🔴 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/app/services/email.py (reset email body strings)
- **Detail**: Email bodies hardcoded "1 hour" regardless of PASSWORD_RESET_TOKEN_EXPIRE_HOURS setting.
- **Fix**: Added {expires_label} format variable to bodies, _EXPIRES_LABELS dict per language, expires_hours param to send_password_reset_email(), passed settings.password_reset_token_expire_hours from call site.
- **Decision**: FIXED

### F4 — Non-expiring token config not validator-guarded

- **Severity**: 🔴 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/app/core/config.py
- **Detail**: PASSWORD_RESET_TOKEN_EXPIRE_HOURS=0 produces non-expiring tokens with no warning.
- **Fix**: Added @field_validator("password_reset_token_expire_hours") that emits warnings.warn when value is 0.
- **Decision**: FIXED

### F5 — No test for SMTP failure path

- **Severity**: 🔴 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/tests/test_reset_password.py
- **Detail**: No test verifying SMTP exception doesn't propagate as 500 after F1 fix.
- **Fix**: Added test_forgot_password_smtp_failure_still_returns_200 — mocks send_password_reset_email to raise SMTPException, asserts 200 response.
- **Decision**: FIXED
