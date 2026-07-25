"use client";

// components/SiteHeader.tsx — the public site's quiet header, for pages that aren't
// the map.
//
// IT RENDERS NOTHING ON `/`. The map home owns its own floating chrome
// (MapNav), because UX §7b rules out a bar there: "the map is the whole canvas
// — not a header, not a toolbar, not chrome around the map." A bordered strip
// above a full-bleed map is exactly that, and this one was also constrained to
// max-w-3xl while the map beneath ran edge to edge, so they never lined up.
//
// Content pages are a different problem and do want a header: there's no map
// to float on, and /places or a location page with no way back to the map is a
// dead end.
//
// Minimal by design regardless: the place is the hero, chrome stays out of the
// way. No profile, no avatar, no follower counts — there are no public
// identities here (D23). The signed-in email that used to sit in this bar is
// gone; it's in the menu on the map, and on a content page it was just noise
// occupying the widest part of the layout.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const LINK =
  "text-[var(--muted)] transition-colors hover:text-[var(--ink)] " +
  "focus-visible:text-[var(--ink)] focus-visible:outline-none";

export function SiteHeader({ email }: { email: string | null }) {
  const pathname = usePathname();

  // The map is its own surface (see the note above). /signin and /signup are
  // thresholds, not pages — nav on them is noise, and they carry their own
  // quiet way back to the map (AuthShell).
  if (pathname === "/" || pathname === "/signin" || pathname === "/signup")
    return null;

  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-[var(--ink)] transition-opacity hover:opacity-70"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Australia Is Beautiful
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {/* Self-links are omitted — a nav item pointing at the page you're on
              is a button to nowhere (same reasoning as the map wordmark). */}
          {pathname !== "/request" && (
            <Link href="/request" className={LINK}>
              Suggest a place
            </Link>
          )}

          {email ? (
            <>
              {pathname !== "/contributions" && (
                <Link href="/contributions" className={LINK}>
                  Your contributions
                </Link>
              )}
              <button
                onClick={() =>
                  // Absolute URL from the current host — keeps the redirect on
                  // whichever host the user is actually on (see AdminSignOut).
                  signOut({ callbackUrl: `${window.location.origin}/` })
                }
                className={LINK}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/signin" className={LINK}>
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
