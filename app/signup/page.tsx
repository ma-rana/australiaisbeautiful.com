// app/signup/page.tsx — the signup route's SERVER half.
//
// Same guard as /signin, same reasoning (see app/signin/page.tsx): a
// signed-in person has no business on a create-account form, so the server
// redirects them before the form ever renders — no client-side flash, no
// middleware involvement.
//
// NEXT.JS 16: `searchParams` is a Promise and must be awaited.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/safe-callback";
import { SignUpForm } from "./SignUpForm";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await getSessionUser();
  if (user) {
    const { callbackUrl } = await searchParams;
    redirect(safeCallbackUrl(callbackUrl));
  }
  return <SignUpForm />;
}
