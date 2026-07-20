// app/location/[slug]/page.tsx — a single location page.
//
// The FIRST real product page: reads a Location from the database and shows it.
// A server component that queries Prisma directly (App Router pattern).
//
// NEXT.JS 16 NOTE: in recent Next, `params` is a Promise and must be awaited.
// If your Next version differs, this is the line to check against current docs.
//
// This is deliberately minimal — no auth, no moments, no map yet. It proves the
// database → page pipeline with real data (Manallack Reserve). Everything else
// (hero, moment grid, ratings, chat) layers onto this frame later.

import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { LocationDetailsSchema } from "@/lib/schemas/location";

// Next 16: params is async.
export default async function LocationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const location = await db.location.findUnique({
    where: { slug },
  });

  // Not found, or not public yet — a signed-out visitor must never see a
  // PENDING/REJECTED location. (Later: allow staff to preview non-public ones.)
  if (!location || location.status !== "APPROVED") {
    notFound();
  }

  // Parse the render-only JSONB safely (the pattern from lib/schemas).
  const details = LocationDetailsSchema.parse(location.details ?? {});

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {/* The place is the main character. Name + intro lead; no contributor,
          no author, no chrome competing with the place. */}
      <p className="text-sm uppercase tracking-wide text-neutral-500">
        {location.suburb ? `${location.suburb}, ` : ""}
        {location.state}
      </p>

      <h1 className="mt-1 text-4xl font-semibold text-neutral-900 dark:text-neutral-100">
        {location.name}
      </h1>

      <p className="mt-4 text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
        {location.intro}
      </p>

      {/* A quiet facts row — only what we actually know. */}
      <dl className="mt-8 space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
        {location.address && (
          <div>
            <dt className="font-medium text-neutral-800 dark:text-neutral-200">
              Where
            </dt>
            <dd>{location.address}</dd>
          </div>
        )}

        {details.entryFee?.free && (
          <div>
            <dt className="font-medium text-neutral-800 dark:text-neutral-200">
              Entry
            </dt>
            <dd>Free</dd>
          </div>
        )}

        {details.bestTimeToVisit && (
          <div>
            <dt className="font-medium text-neutral-800 dark:text-neutral-200">
              Best time
            </dt>
            <dd>{details.bestTimeToVisit}</dd>
          </div>
        )}
      </dl>

      {/* Where the moment grid will go, once uploads exist. Framed emptiness,
          not a blank void — this is the honest empty state from the UX design. */}
      <section className="mt-12 border-t border-neutral-200 pt-8 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">
          Experiences here
        </h2>
        <p className="mt-2 text-neutral-500">
          No photos yet — this place is waiting for its first moment.
        </p>
      </section>
    </main>
  );
}
