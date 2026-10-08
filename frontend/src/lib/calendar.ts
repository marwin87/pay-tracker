// Calendar arithmetic shared by every calendar in the app. Pure string/UTC math, so the
// result never depends on the browser's time zone: 2026-10-09 is a Friday everywhere.

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday-first column of the 1st of the month (0=Mon … 6=Sun). */
export function firstDayOffset(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

/** "YYYY-MM" shifted by `delta` months. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Formats a calendar date in `locale` (UTC-pinned, so the day never shifts). */
export function formatDate(locale: string, y: number, m: number, d: number, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Short Monday-first weekday headers. */
export function weekdayHeaders(locale: string): string[] {
  // 2024-01-01 is a Monday; only the label matters
  return Array.from({ length: 7 }, (_, i) => formatDate(locale, 2024, 1, 1 + i, { weekday: "short" }).replace(/\.$/, "").slice(0, 3));
}
