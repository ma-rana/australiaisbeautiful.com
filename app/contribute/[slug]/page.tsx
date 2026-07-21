// app/contribute/[slug]/page.tsx — the contribute entry point for a location.
//
// Server component: checks the user is signed in (the gentle wall — if not,
// send to sign-in), confirms the location exists, and renders the composer.

import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { Composer } from "./Composer";

export default async function ContributePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const location = await db.location.findUnique({
    where: { slug },
    select: { id: true, name: true, status: true },
  });
  if (!location || location.status !== "APPROVED") notFound();

  // The gentle wall: contributing needs an account. Viewing never does.
  const user = await getSessionUser();
  if (!user) {
    redirect(`/signin?callbackUrl=/contribute/${slug}`);
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <p className="text-sm text-neutral-500">Add to</p>
      <h1 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {location.name}
      </h1>
      <Composer locationId={location.id} slug={slug} />
    </main>
  );
}
