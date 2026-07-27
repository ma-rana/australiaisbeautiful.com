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
  "specimen-label transition-colors hover:text-[var(--ink)] " +
  "focus-visible:text-[var(--ink)] focus-visible:outline-none";

// The one elevated action. A quiet pill — bordered, not filled — because the
// header must never outshine the page, but "Suggest a place" is the header's
// reason to exist and deserves more than a text link.
const PILL =
  "specimen-label rounded-full border border-[var(--border)] px-3.5 py-2 " +
  "text-[var(--eucalypt)] transition-colors hover:border-[var(--eucalypt)]/50 " +
  "hover:bg-[var(--eucalypt)]/5 focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[var(--eucalypt)]/30";

export function SiteHeader({ email }: { email: string | null }) {
  const pathname = usePathname();

  // The map is its own surface (see the note above). /signin and /signup are
  // thresholds; /request, /contributions, location and contribute pages are
  // destinations that carry their own quiet way back — a navbar on them
  // stacks a second navigation system on pages that already have one.
  // What remains of this header serves /places.
  if (
    pathname === "/" ||
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/request" ||
    pathname === "/help" ||
    pathname === "/contributions" ||
    pathname.startsWith("/location/") ||
    pathname.startsWith("/contribute/")
  )
    return null;

  return (
    <header className="border-b border-[var(--border)] bg-[var(--paper)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3.5">
        {/* The wordmark is the way BACK — to the map, which is home. The
            eucalypt dot is the same mark that stands for a place on the map
            itself: a quiet signature, not a logo. */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-[var(--eucalypt)] ring-2 ring-[var(--eucalypt)]/20 transition-transform group-hover:scale-110"
          />
          <span className="transition-opacity group-hover:opacity-70">
            Australia Is Beautiful
          </span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-5">
          {/* Self-links are omitted — a nav item pointing at the page you're on
              is a button to nowhere (same reasoning as the map wordmark). */}
          {email && pathname !== "/contributions" && (
            <Link href="/contributions" className={LINK}>
              Your contributions
            </Link>
          )}

          {/* Help is reachable by anyone, signed in or not — it's also where a
              signed-out person reports a broken sign-up. */}
          <Link href="/help" className={LINK}>
            Help
          </Link>

          {email ? (
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
          ) : (
            <Link href="/signin" className={LINK}>
              Sign in
            </Link>
          )}

          {/* The primary action sits last — the end of a scan line is where
              the eye rests, and the pill holds it. */}
          {pathname !== "/request" && (
            <Link href="/request" className={PILL}>
              Suggest a place
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
