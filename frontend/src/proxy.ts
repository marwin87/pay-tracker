import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicRoutes = ["/login", "/register", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("access_token")?.value;

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );

  if (!token && !isPublicRoute) {
    // Marks this as a session-expiry redirect (as opposed to a plain
    // unauthenticated visit) so the login page can show the "session
    // expired" banner even when no client-side 401 ever fired — this path
    // runs server-side, before React mounts, so it can't touch sessionStorage.
    const url = new URL("/login", request.url);
    url.searchParams.set("session_expired", "1");
    return NextResponse.redirect(url);
  }

  if (token && isPublicRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|icon-(?:192|512)\\.png$|pt-logo\\.png$).*)",
  ],
};
