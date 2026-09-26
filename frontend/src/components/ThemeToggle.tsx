"use client";

import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTranslations } from "next-intl";
import { MENU_ROW_CLASS } from "@/components/menuRow";

/** Menu row (avatar menu / mobile menu) that flips light/dark on click. */
export default function ThemeToggle() {
  const t = useTranslations("ThemeToggle");
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    setDark(isDark);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("ariaLabel")}
      suppressHydrationWarning
      className={MENU_ROW_CLASS}
    >
      {dark ? <Moon size={15} /> : <Sun size={15} />}
      <span suppressHydrationWarning>{t("label")}</span>
      <span suppressHydrationWarning className="ml-auto text-xs font-normal text-slate-400 dark:text-slate-500">
        {dark ? t("dark") : t("light")}
      </span>
    </button>
  );
}
