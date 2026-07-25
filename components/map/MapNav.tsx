"use client";

// components/map/MapNav.tsx — the map's top chrome. Two elements, and that's the point.
//
// UX §7b on the map home: "the map is the whole canvas; search is ONE minimal
// element floating on top of it. Not a header, not a toolbar, not chrome around
// the map." The bordered SiteHeader bar was precisely the thing that rules out,
// and it was also constrained to max-w-3xl while the map beneath it ran
// full-bleed, so the two never lined up.
//
// What used to be five links plus a floating "Browse as a list" pill is now:
//
//   top-left   the wordmark
//   top-right  sign in, or the account menu
//
// Nothing else. "Suggest a place" is the compass in the bottom-right stack
// (§7c: the request belongs on the map at the moment of noticing), so it isn't
// duplicated here.
//
// THE MENU ONLY EXISTS WHEN SIGNED IN. Signed out, the only thing it could hold
// is "Sign in" — and a button that opens a menu containing one item is strictly
// worse than showing that item. So signed out is a plain pill, and the menu
// appears only once there's more than one thing to put in it.
//
// The corner therefore changes SHAPE between states — a text pill signed out, a
// circle signed in. That's deliberate, and it's what both Google Maps and Waze
// do. The two states have different jobs: signed out has to tell you an account
// exists at all, signed in only has to get you to account actions. Nobody sees
// both at once, so the inconsistency is a designer's problem, not a user's.
//
// NO PROMINENT SIGN-IN BUTTON either. Waze leads with a blue Login pill because
// an account is central there. Here browsing is fully open and an account is
// only needed to contribute, so §7b asks for "a quiet, honest sign-in / sign-up
// affordance in the corner — available, not demanded." Same surface as
// everything else, no accent colour: available, not demanded.
//
// Every floating element is 44px tall — the wordmark, the pill, the menu
// button, and the controls in the bottom-right stack. Mixed heights are what
// makes floating chrome look assembled rather than designed.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { MAP_SURFACE, MAP_BUTTON } from "./chrome";

// The signed-in button is a PERSON, not a hamburger. It briefly was one, from
// when the menu also held navigation — but a hamburger promises site navigation,
// and this menu now holds only account actions. The icon should describe what's
// actually inside it.
//
// Not an avatar or an initial, though. There's no avatar data: User has no
// handle, display name or image, and START_HERE calls that load-bearing. An
// initial pulled from the email would be private rather than public, so it
// doesn't strictly break the rule — but it creates a slot that wants filling,
// which is the same drift the docs warn about with /dashboard vs /profile.
function AccountIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="8.4" r="3.6" />
      <path d="M5 19.6c0-3.6 3.1-6.1 7-6.1s7 2.5 7 6.1" />
    </svg>
  );
}

const PILL = "flex h-11 items-center rounded-full px-4 leading-none text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]";

const ITEM =
  "block w-full px-4 py-2.5 text-left text-sm text-[var(--ink)] transition-colors " +
  "hover:bg-[var(--paper-2)] focus-visible:bg-[var(--paper-2)] focus-visible:outline-none";

export function MapNav({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape. Both, not one: a menu that only
  // closes by clicking its own button is a menu people leave open by accident.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    // pointer-events-none on the bar, auto on each child: the gap between the
    // wordmark and the corner is still map, and still draggable. A full-width
    // overlay that swallows drags is the usual bug with floating chrome.
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-4">
      <Link
        href="/"
        className={`pointer-events-auto ${MAP_SURFACE} ${PILL} truncate text-[0.9rem]`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        Australia Is Beautiful
      </Link>

      {email ? (
        <div ref={wrapRef} className="pointer-events-auto relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Account"
            className={`${MAP_SURFACE} ${MAP_BUTTON} rounded-full text-[var(--ink)]`}
          >
            <AccountIcon />
          </button>

          {open && (
            <div
              role="menu"
              className={`${MAP_SURFACE} absolute right-0 top-[calc(100%+0.5rem)] w-56 overflow-hidden rounded-2xl py-1.5`}
            >
              <Link
                href="/contributions"
                role="menuitem"
                className={ITEM}
                onClick={() => setOpen(false)}
              >
                Your contributions
              </Link>

              <div className="my-1.5 h-px bg-[var(--border)]" />

              {/* The address is the only identity this product has, and it's
                  shown to you and nobody else (§7c). Quiet, and not a link —
                  there's no profile to open. */}
              <p className="truncate px-4 pb-1.5 text-xs text-[var(--muted)]">{email}</p>

              <button
                type="button"
                role="menuitem"
                className={ITEM}
                onClick={() => {
                  setOpen(false);
                  // Absolute URL from the current host — keeps the redirect on
                  // whichever host the user is actually on (see AdminSignOut).
                  signOut({ callbackUrl: `${window.location.origin}/` });
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <Link
          href="/signin"
          className={`pointer-events-auto ${MAP_SURFACE} ${PILL} shrink-0 text-sm`}
        >
          Sign in
        </Link>
      )}
    </div>
  );
}
