"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface AuthContextValue {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Presence is detected from the non-HttpOnly auth_logged_in cookie.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => getAuthToken() !== null,
  );
  const router = useRouter();

  // Backend sets both HttpOnly access_token and presence auth_logged_in cookies.
  // login() just syncs React state to reflect the new auth state.
  const login = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Proceed with client-side logout even if the request fails.
    }
    setIsAuthenticated(false);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
