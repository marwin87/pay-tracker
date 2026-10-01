// "Today" and the current month in a given IANA time zone. The backend decides what is
// overdue in the user's profile zone, so the UI has to read the calendar in that same
// zone, not the browser's (they differ when travelling or after changing the profile).

/** The browser's own zone, or "UTC" where it can't tell. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** All zones the browser knows, for the picker (empty on very old browsers). */
export function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  // supportedValuesOf omits "UTC", which is a valid (and the default) zone
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

/** YYYY-MM-DD for `now` in `timeZone` (falls back to the browser zone if unknown). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : browserTimeZone();
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** YYYY-MM in `timeZone`. */
export function monthIn(timeZone: string, now: Date = new Date()): string {
  return todayIn(timeZone, now).slice(0, 7);
}
