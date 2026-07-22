"use client";

// app/admin/AdminSignOut.tsx — sign out of the admin session.
// The admin session is host-scoped, so this only ends the admin session; a
// separate public session (if any) is untouched.

import { signOut } from "next-auth/react";

export function AdminSignOut() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/signin" })}
      className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
    >
      Sign out
    </button>
  );
}
