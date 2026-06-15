"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wallet, Receipt, CreditCard, LogOut, Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import BackupButton from "@/components/BackupButton";

const NAV_ITEMS = [
  { href: "/dashboard/payments", labelKey: "payments" as const, icon: CreditCard },
  { href: "/dashboard/bills", labelKey: "bills" as const, icon: Receipt },
];

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
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  // Close menu when clicking outside
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

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav */}
      <header ref={menuRef} className="relative sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold text-indigo-600 dark:text-indigo-400"
          >
            <Wallet size={22} />
            <span className="text-lg">Pay Tracker</span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex flex-1 items-center gap-1 ml-4">
            {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                  }`}
                >
                  <Icon size={15} />
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-1 ml-auto">
            <LanguageToggle />
            <BackupButton />
            <ThemeToggle />
            <button
              onClick={logout}
              aria-label={t("logOut")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <LogOut size={15} />
              <span>{t("logOut")}</span>
            </button>
          </div>

          {/* Mobile: utility icons + hamburger */}
          <div className="flex md:hidden items-center gap-1 ml-auto">
            <LanguageToggle />
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
                  {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
                    const active = pathname === href || pathname.startsWith(href + "/");
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          active
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                        }`}
                      >
                        <Icon size={16} />
                        {t(labelKey)}
                      </Link>
                    );
                  })}

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
                    <BackupButton />
                    <ThemeToggle />
                    <button
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
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
      <main className="flex-1">{children}</main>
    </div>
  );
}
