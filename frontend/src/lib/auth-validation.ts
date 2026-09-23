// Client-side checks for the auth forms (login/register/forgot/reset), which
// set noValidate on their <form> so the browser's native, unstyled and
// browser-locale (not app-locale) validation popups never show — these
// return the app's own localized message instead.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRequired(value: string, t: (key: string) => string): string | null {
  return value.trim() ? null : t("requiredField");
}

export function validateEmail(value: string, t: (key: string) => string): string | null {
  if (!value.trim()) return t("requiredField");
  return EMAIL_RE.test(value) ? null : t("invalidEmail");
}
