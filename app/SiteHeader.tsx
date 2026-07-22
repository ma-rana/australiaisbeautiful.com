"use client";

// app/SiteHeader.tsx — the public site's quiet header.
//
// Minimal by design: the place is the hero, chrome stays out of the way. Shows
// the wordmark, and either a sign-in link or a signed-in indicator + sign out.
// No profile, no avatar, no follower counts — there are no public identities
// here (D23); this is purely "are you signed in, and how do you leave".

import Link from "next/link";
import { signOut } from "next-auth/react";

export function SiteHeader({ email }: { email: string | null }) {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-medium text-neutral-900 hover:opacity-70 dark:text-neutral-100"
        >
          Australia Is Beautiful
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/request"
            className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Suggest a place
          </Link>
          {email ? (
            <>
              <span className="hidden text-neutral-500 sm:inline">{email}</span>
              <button
                onClick={() =>
                  // Absolute URL from the current host — keeps the redirect on
                  // whichever host the user is actually on (see AdminSignOut).
                  signOut({ callbackUrl: `${window.location.origin}/` })
                }
                className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/signin"
              className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
