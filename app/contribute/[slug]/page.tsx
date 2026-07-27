// app/contribute/[slug]/page.tsx — the contribute entry point for a location.
//
// Server component: checks the user is signed in (the gentle wall — if not,
// send to sign-in), confirms the location exists, and renders the composer.

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { MapBackdropShell } from "@/components/MapBackdropShell";
import { ArrowLeft } from "@/components/icons";
import { Composer } from "./Composer";

export default async function ContributePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const location = await db.location.findUnique({
    where: { slug },
    select: { id: true, name: true, status: true, suburb: true, state: true },
  });
  if (!location || location.status !== "APPROVED") notFound();

  // The gentle wall: contributing needs an account. Viewing never does.
  const user = await getSessionUser();
  if (!user) {
    redirect(`/signin?callbackUrl=/contribute/${slug}`);
  }

  return (
    <>
      <MapBackdropShell variant="contours" />
      <main className="relative mx-auto w-full max-w-xl flex-1 px-6 py-8 sm:px-8">
        {/* The way back is the PLACE, not the map — you came from its page and
            your photos are going onto it. Same specimen device as everywhere. */}
        <Link
          href={`/location/${slug}`}
          className="specimen-label inline-flex items-center gap-1.5 transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={15} strokeWidth={2.4} />
          Back to {location.name}
        </Link>

        {/* Field-guide header — the place stays the hero even while you're
            giving it something. */}
        <header className="mt-10 border-b border-[var(--border)] pb-8">
          <p className="specimen-label text-[var(--ochre)]">
            New moment
            {location.suburb || location.state
              ? ` · ${[location.suburb, location.state].filter(Boolean).join(", ")}`
              : ""}
          </p>
          <h1
            className="mt-3 text-4xl tracking-tight text-[var(--ink)] sm:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {location.name}
          </h1>
          <p className="mt-4 max-w-lg leading-relaxed text-[var(--foreground)]/85">
            Your photos and field notes go straight onto this place&apos;s page
            — shared as <span className="italic">an Explorer</span>, never under
            your name.
          </p>
        </header>
        <Composer locationId={location.id} slug={slug} />
      </main>
    </>
  );
}
