"use client";

import { useAuth } from "@/context/auth-context";

export default function DashboardPage() {
  const { logout } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold text-foreground">Pay Tracker</h1>
        <p className="text-foreground/60">You are logged in.</p>
        <button
          onClick={logout}
          className="rounded-full border border-foreground/20 px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
        >
          Log out
        </button>
      </div>
    </main>
  );
}
