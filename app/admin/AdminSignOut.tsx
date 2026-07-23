"use client";

// app/admin/AdminSignOut.tsx — sign out of the admin session.
//
// The admin session is host-scoped, so this only ends the admin session; a
// separate public session (if any) is untouched.
//
// The callbackUrl must be an ABSOLUTE url built from the CURRENT host. A
// relative "/signin" can be resolved by Auth.js against its configured base URL
// (the public site), which would bounce a signing-out admin onto the public
// sign-in page — breaking the host separation.

import { signOut } from "next-auth/react";

export function AdminSignOut() {
  const onSignOut = () => {
    signOut({ callbackUrl: `${window.location.origin}/signin` });
  };

  return (
    <button
      onClick={onSignOut}
      className="text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
    >
      Sign out
    </button>
  );
}
