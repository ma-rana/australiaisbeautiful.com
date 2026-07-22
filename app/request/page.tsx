// app/request/page.tsx — suggest a place.
//
// The gentle wall: suggesting needs an account (viewing never does). If not
// signed in, redirect to sign-in and come back here after.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { RequestForm } from "./RequestForm";

export default async function RequestPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?callbackUrl=/request");

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1
        className="text-3xl text-[var(--ink)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Suggest a place
      </h1>
      <p className="mt-3 leading-relaxed text-[var(--muted)]">
        Know somewhere that belongs here? Tell us where it is and why it&apos;s
        worth the trip. Not every suggestion becomes a place on the map — the
        bar is &ldquo;would someone travel for this&rdquo; — but every one gets
        read.
      </p>
      <RequestForm />
    </main>
  );
}
