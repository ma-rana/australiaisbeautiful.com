// middleware.ts — hostname-based routing for the admin subdomain.
// Public site and admin live in ONE Next.js app; this splits them by Host.
//
//   admin.australiaisbeautiful.com/foo  →  rewrites to  /admin/foo (internally)
//   australiaisbeautiful.com/foo        →  served as-is (public)
//
// The URL in the browser stays clean; the rewrite is internal.
//
// IMPORTANT: this is ROUTING, not AUTH. The /admin routes must STILL check the
// session on every request (requireModerator/requireAdmin in lib/auth.ts). The
// subdomain just decides which routes render — it does not authenticate anyone.
//
// DEV vs PROD:
//   - In production, admin is ONLY reachable via the admin subdomain, and /admin
//     is hidden (404) on the public host. Strict.
//   - In development, cross-subdomain cookies on *.localhost are unreliable, so
//     we ALSO allow /admin/* directly on localhost (same host = same cookie =
//     no cross-subdomain session problem). The subdomain rewrite still works too.
//   This keeps local dev friction-free while production stays strict. When the
//   dedicated admin auth flow is built later, this relaxation can be revisited.

import { NextRequest, NextResponse } from "next/server";

const ADMIN_HOST = "admin.australiaisbeautiful.com";
const isDev = process.env.NODE_ENV !== "production";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl;
  const hostname = host.split(":")[0];

  const isAdminHost = hostname === ADMIN_HOST || hostname === "admin.localhost";

  if (isAdminHost) {
    if (!url.pathname.startsWith("/admin")) {
      url.pathname = `/admin${url.pathname}`;
    }
    return NextResponse.rewrite(url);
  }

  // /admin on the public host:
  //   - dev  → allow it (so localhost:3000/admin/moments works without the
  //            subdomain + its cookie headaches)
  //   - prod → hide it (404). Admin is subdomain-only in production.
  if (url.pathname.startsWith("/admin") && !isDev) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
