"use client";

// app/admin/AdminSignOut.tsx — sign out of the admin session.
//
// The admin session is host-scoped, so this only ends the admin session; a
// separate public session (if any) is untouched.
//
// IMPORTANT: the callbackUrl must be an ABSOLUTE url built from the CURRENT
// host. A relative "/signin" can be resolved by Auth.js against its configured
// base URL (the public site), which would bounce a signing-out admin onto the
// public sign-in page — breaking the host separation. Using window.location.origin
// keeps the redirect on admin.* where it belongs.

import { signOut } from "next-auth/react";

export function AdminSignOut() {
  const onSignOut = () => {
    // e.g. https://admin.australiaisbeautiful.com/signin
    //      http://admin.localhost:3000/signin
    const target = `${window.location.origin}/signin`;
    signOut({ callbackUrl: target });
  };

  return (
    <button
      onClick={onSignOut}
      className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
    >
      Sign out
    </button>
  );
}
