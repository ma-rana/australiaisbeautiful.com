// app/signin/page.tsx — the sign-in route's SERVER half.
//
// A signed-in person on a sign-in form is a state that shouldn't exist, so the
// guard lives here, on the server, before any form renders: session → redirect
// to wherever they were headed (sanitized), no session → the form.
//
// Server-side rather than a client useEffect, deliberately: an effect-based
// bounce paints the form first and then yanks it away — a flash of the wrong
// page — and it doesn't run at all before hydration. redirect() here means the
// browser never receives the form.
//
// NOT in middleware, also deliberately: middleware.ts is routing, not auth
// (its own header says so), and reading the session there would drag the
// Prisma-adjacent auth module into the middleware bundle. This page IS the
// right layer — the same place every protected page does its own checking.
//
// NEXT.JS 16: `searchParams` is a Promise and must be awaited.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/safe-callback";
import { SignInForm } from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await getSessionUser();
  if (user) {
    const { callbackUrl } = await searchParams;
    // Already in — carry on to where they were going, or home. The sanitizer
    // matters here too: this redirect is just as forgeable as the client one.
    redirect(safeCallbackUrl(callbackUrl));
  }
  return <SignInForm />;
}
