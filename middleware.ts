// middleware.ts — hostname-based routing. The HOST is the separation.
//
//   admin.australiaisbeautiful.com/moments  →  internally renders app/admin/moments
//   admin.australiaisbeautiful.com/signin   →  internally renders app/admin/signin
//   australiaisbeautiful.com/...            →  public pages, as-is
//
// The admin URL has NO /admin prefix — being on the admin host IS what makes it
// admin. The /admin path segment exists only as a FILE location (app/admin/*),
// never as a public URL.
//
// /admin/* on the PUBLIC host is always 404 — in dev and prod alike. There is
// exactly one way to reach admin: the admin hostname.
//
// IMPORTANT: this is ROUTING, not AUTH. Admin pages must STILL check the session
// (requireModerator/requireAdmin). The host decides which routes render; it
// authenticates nobody.
//
// Local dev: use http://admin.localhost:3000 (modern browsers resolve
// *.localhost to 127.0.0.1 automatically — no hosts-file edit needed).

import { NextRequest, NextResponse } from "next/server";

const ADMIN_HOSTS = new Set([
  "admin.australiaisbeautiful.com",
  "admin.localhost",
]);

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];
  const url = req.nextUrl;

  if (ADMIN_HOSTS.has(hostname)) {
    // On the admin host, map every path into the app/admin/* file tree.
    // /moments → /admin/moments, /signin → /admin/signin, / → /admin
    if (!url.pathname.startsWith("/admin")) {
      url.pathname = `/admin${url.pathname === "/" ? "" : url.pathname}`;
    }
    return NextResponse.rewrite(url);
  }

  // Public host: /admin is not a thing. Never was. 404 — dev and prod alike.
  if (url.pathname.startsWith("/admin")) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
