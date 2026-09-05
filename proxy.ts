import { NextRequest, NextResponse } from "next/server";
import { readSessionFromCookieValue, SESSION_COOKIE_NAME } from "./lib/auth/session";

// Next.js 16 renamed `middleware` to `proxy` (network-boundary/routing focus).
// This runs on every request to gate access to the authenticated app shell.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = pathname === "/login" || pathname.startsWith("/_next") || pathname.startsWith("/favicon");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await readSessionFromCookieValue(token);

  if (!isPublicPath && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
