import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/app/lib/firebase-admin";

// Public pages — no auth required. Add paths here to gate them behind
// Firebase session cookie. /players intentionally left public so users
// can browse Ligue 1 / Ligue 2 player stats without logging in.
const PROTECTED: string[] = [];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!PROTECTED.some((p) => path.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get("session")?.value;
  if (cookie) {
    try {
      const adminAuth = getAdminAuth();
      await adminAuth.verifySessionCookie(cookie, true);
      return NextResponse.next();
    } catch { /* expired / invalid */ }
  }

  const loginUrl = new URL("/login", req.nextUrl);
  loginUrl.searchParams.set("from", path);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|ico|svg)$).*)"],
};
