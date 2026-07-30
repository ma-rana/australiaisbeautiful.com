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
// /admin/* on a PUBLIC host is always 404 — in dev and prod alike. There is
// exactly one way to reach admin: the admin hostname. (Loopback hosts are the
// app talking to ITSELF — see the pass-through below — not a public door.)
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

// The app's own address, as the app itself sees it. When Next self-proxies an
// admin rewrite (see below), the second hop arrives with one of these Hosts.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];
  const url = req.nextUrl;

  // API routes are NEVER rewritten — they live at their real paths on every
  // host. Auth.js needs /api/auth/* reachable as-is; rewriting it into
  // /admin/api/auth/* 404s and breaks sign-in entirely.
  if (url.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (ADMIN_HOSTS.has(hostname)) {
    // On the admin host, map page paths into the app/admin/* file tree.
    // /moments → /admin/moments, /signin → /admin/signin, / → /admin
    //
    // HOW THE REWRITE MUST BE BUILT (hard-won, do not "simplify"):
    //
    // NextResponse.rewrite() only performs an INTERNAL rewrite when the target
    // URL's origin STRING-matches what Next considers its own origin. Behind
    // Nginx + TLS, req.nextUrl resolves to `https://localhost:3100/...` — the
    // forwarded https proto glued onto the app's real bind. Two failure modes
    // came out of that on the VPS:
    //
    //   1. Leaving the cloned URL's protocol as `https:` → the target origin
    //      (https://localhost:3100) differs from the app's http self, so Next
    //      PROXIES to https://localhost:3100 → `EPROTO wrong version number`
    //      (a TLS handshake against a plain-http server) → 500.
    //   2. Pinning the host to `127.0.0.1:3100` → still not a string match for
    //      `localhost:3100`, so Next proxies over http to itself; that second
    //      hop re-entered this middleware with a loopback Host and was shot by
    //      the public-host `/admin → 404` rule below.
    //
    // So: clone req.nextUrl (its host is ALREADY the app's own notion of self —
    // never override it), force ONLY the protocol to http (the bind is plain
    // http; the https came from X-Forwarded-Proto), and set the pathname. In
    // dev, nextUrl is already http://admin.localhost:3000 and this is a no-op
    // origin-wise. Rewrite must be a URL object — a bare path string throws
    // "Please use only absolute URLs" in middleware, which is itself a 500.
    const rewriteUrl = url.clone();
    rewriteUrl.protocol = "http:";
    if (!url.pathname.startsWith("/admin")) {
      rewriteUrl.pathname = `/admin${url.pathname === "/" ? "" : url.pathname}`;
    }

    const res = NextResponse.rewrite(rewriteUrl);

    // Never let an admin page sit in a cache. Without this the BROWSER can
    // serve a previously-rendered admin screen from its back/forward cache
    // after sign-out, without ever hitting the server or its auth gate.
    res.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0",
    );
    res.headers.set("Pragma", "no-cache");
    // Keep admin pages out of search results and referrer leaks.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Referrer-Policy", "same-origin");
    return res;
  }

  if (url.pathname.startsWith("/admin")) {
    // LOOPBACK PASS-THROUGH (safety net for the rewrite above): if Next ever
    // decides the rewrite target is cross-origin, it satisfies it by PROXYING
    // to its own bind — and that internal hop arrives here with Host
    // `localhost:3100` / `127.0.0.1:3100` and the /admin path already applied.
    // That hop must be allowed to render, or the admin host 404s even though
    // every layer did its job. This is NOT a public door: the loopback Host
    // only reaches the app from the box itself (the bind is 127.0.0.1), and
    // every admin page still runs its own require* auth guard regardless.
    if (LOOPBACK_HOSTS.has(hostname)) {
      return NextResponse.next();
    }

    // Public host: /admin is not a thing. Never was. 404 — dev and prod alike.
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
