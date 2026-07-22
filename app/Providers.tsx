"use client";

// app/Providers.tsx — client-side providers.
// SessionProvider is required for next-auth/react hooks and signOut() to work
// in client components.

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
