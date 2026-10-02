"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Archive, CalendarCheck, ClipboardPen, LayoutGrid, LogOut, Menu, X, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { getAuthToken } from "@/lib/auth";
import { fetchMe } from "@/lib/user-api";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { MENU_ROW_CLASS } from "@/components/menuRow";

// Full class strings so Tailwind can see them; picked per user by hashing the email.
const AVATAR_PALETTES = [
  { grad: "from-green-500 to-teal-500", shadow: "shadow-teal-500/30" },
  { grad: "from-blue-500 to-indigo-500", shadow: "shadow-indigo-500/30" },
  { grad: "from-violet-500 to-fuchsia-500", shadow: "shadow-fuchsia-500/30" },
  { grad: "from-orange-500 to-rose-500", shadow: "shadow-rose-500/30" },
  { grad: "from-sky-500 to-cyan-500", shadow: "shadow-cyan-500/30" },
  { grad: "from-amber-500 to-orange-500", shadow: "shadow-orange-500/30" },
];

function avatarPalette(email: string | null | undefined) {
  let h = 0;
  for (const c of email ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "dashboard" as const, icon: LayoutGrid, exact: true },
  { href: "/dashboard/payments", labelKey: "payments" as const, icon: CalendarCheck, exact: false },
  { href: "/dashboard/bills", labelKey: "bills" as const, icon: ClipboardPen, exact: true },
  { href: "/dashboard/bills/archived", labelKey: "archived" as const, icon: Archive, exact: false },
];

// Settings lives in the avatar menu on desktop and in the hamburger menu on mobile.
const SETTINGS_ITEM = { href: "/dashboard/settings", labelKey: "settings" as const, icon: Settings, exact: false };
const MOBILE_NAV_ITEMS = [...NAV_ITEMS, SETTINGS_ITEM];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, logout } = useAuth();
  const t = useTranslations("DashboardLayout");
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // `isAuthenticated` is forced false for one render right after hydration
    // (useSyncExternalStore's getServerSnapshot, see lib/auth-store.ts) even
    // when the real auth_logged_in cookie is already present — redirecting
    // on that alone bounces a fresh, valid page load to /login, which then
    // bounces back to /dashboard (proxy.ts redirects an authenticated user
    // off a public route), stomping the actual nested route being loaded.
    // Only redirect once the real cookie also agrees we're logged out.
    if (!isAuthenticated && getAuthToken() === null) router.replace("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchMe().then((p) => setUserEmail(p.email)).catch(() => {});
    }
  }, [isAuthenticated]);

  // Close mobile menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (!isAuthenticated) return null;

  const initials = userEmail ? userEmail[0].toUpperCase() : "?";
  const palette = avatarPalette(userEmail);

  return (
    <div className="flex min-h-screen flex-col md:-mb-9">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-slate-200 dark:border-slate-700 md:flex">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-4 py-4 transition-opacity hover:opacity-80"
        >
          <Image src="/pt-logo.png" alt="Pay Tracker" width={32} height={32} className="rounded-xl" />
          <span className="text-lg font-bold tracking-tight">
            <span className="text-[#10231A] dark:text-slate-100">Pay</span>
            <span className="text-[#079447] dark:text-emerald-500">Tracker</span>
          </span>
        </Link>

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />

        {userEmail && (
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${palette.grad} text-sm font-bold text-white shadow-md ${palette.shadow}`}>
              {initials}
            </div>
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{userEmail}</span>
          </div>
        )}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />
        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon, exact }) => {
            const active = pathname === href || (!exact && pathname.startsWith(href + "/"));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  active
                    ? "border border-green-200 bg-green-50 text-green-800 shadow-sm dark:border-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "border border-transparent text-slate-600 hover:border-green-200 hover:bg-green-50 hover:text-green-700 dark:text-slate-400 dark:hover:border-green-800 dark:hover:bg-green-900/20 dark:hover:text-green-300"
                }`}
              >
                <Icon size={16} />
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />

        <div className="flex flex-col gap-0.5 overflow-y-auto p-3">
          <Link href={SETTINGS_ITEM.href} className={MENU_ROW_CLASS}>
            <Settings size={15} />
            {t(SETTINGS_ITEM.labelKey)}
          </Link>
          <ThemeToggle />
          <LanguageToggle />
          <button
            data-logout-trigger
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <LogOut size={14} />
            {t("logOut")}
          </button>
        </div>

        <div className="flex-1" />

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-slate-600" />

        <div className="app-footer flex h-9 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} Pay Tracker · {process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header ref={menuRef} className="relative sticky top-0 z-10 md:hidden border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <Image src="/pt-logo.png" alt="Pay Tracker" width={32} height={32} className="rounded-xl" />
            <span className="text-lg font-bold tracking-tight">
              <span className="text-[#10231A] dark:text-slate-100">Pay</span>
              <span className="text-[#079447] dark:text-emerald-500">Tracker</span>
            </span>
          </Link>

          {/* Mobile: utility icons + hamburger */}
          <div className="flex md:hidden items-center gap-1 ml-auto">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Mobile dropdown */}
            {menuOpen && (
              <div className="absolute top-full inset-x-0 border-b border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-800">
                <div className="mx-auto max-w-4xl px-4 py-3 flex flex-col gap-1">
                  {/* Signed-in email header */}
                  {userEmail && (
                    <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-700/50">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${palette.grad} text-xs font-bold text-white shadow-sm`}>
                        {initials}
                      </div>
                      <span className="truncate text-sm text-slate-600 dark:text-slate-300">{userEmail}</span>
                    </div>
                  )}

                  {MOBILE_NAV_ITEMS.map(({ href, labelKey, icon: Icon, exact }) => {
                    const active = pathname === href || (!exact && pathname.startsWith(href + "/"));
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                          active
                            ? "border border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "border border-transparent text-slate-600 hover:border-green-200 hover:bg-green-50 hover:text-green-700 dark:text-slate-400 dark:hover:border-green-800 dark:hover:bg-green-900/20 dark:hover:text-green-300"
                        }`}
                      >
                        <Icon size={16} />
                        {t(labelKey)}
                      </Link>
                    );
                  })}

                  <div className="mt-1 flex flex-col gap-0.5 border-t border-slate-100 pt-1 dark:border-slate-700">
                    <ThemeToggle />
                    <LanguageToggle />
                    <button
                      data-logout-trigger
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <LogOut size={15} />
                      {t("logOut")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main key={pathname} className="page-in flex-1 md:ml-60">{children}</main>
    </div>
  );
}
