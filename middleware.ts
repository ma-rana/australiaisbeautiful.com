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
// NEXT.JS 16: middleware conventions may differ from older versions. Verify
// against node_modules/next/dist/docs/ before changing this file.

import { NextRequest, NextResponse } from "next/server";

const ADMIN_HOST = "admin.australiaisbeautiful.com";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl;

  // Strip any port (e.g. localhost:3100) for a clean compare.
  const hostname = host.split(":")[0];

  const isAdminHost =
    hostname === ADMIN_HOST ||
    // local dev convenience
    hostname === "admin.localhost";

  if (isAdminHost) {
    // Avoid double-prefixing if the path already starts with /admin.
    if (!url.pathname.startsWith("/admin")) {
      url.pathname = `/admin${url.pathname}`;
    }
    return NextResponse.rewrite(url);
  }

  // If someone hits /admin on the PUBLIC host, hide it entirely.
  if (url.pathname.startsWith("/admin")) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.next();
}

// Don't run middleware on static assets / Next internals.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
