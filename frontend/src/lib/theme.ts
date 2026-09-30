export const THEMES = ["light", "dark", "vesperfall"] as const;
export type Theme = (typeof THEMES)[number];

const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);

export function getTheme(): Theme {
  const v = localStorage.getItem("theme");
  return isTheme(v) ? v : "light";
}

/** Vesperfall is a dark variant, so it keeps the `dark` class and adds its own. */
export function applyTheme(theme: Theme) {
  const cl = document.documentElement.classList;
  cl.toggle("dark", theme !== "light");
  cl.toggle("theme-vesperfall", theme === "vesperfall");
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  localStorage.setItem("theme", theme);
}
