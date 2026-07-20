// app/location/[slug]/page.tsx — a single location page.
//
// Reads a Location + its approved, public moments and renders them. A server
// component that queries Prisma directly; the interactive viewer is a separate
// client component (MomentGrid).
//
// NEXT.JS 16: `params` is a Promise and must be awaited.

import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { LocationDetailsSchema } from "@/lib/schemas/location";
import { MomentGrid, type ViewerMoment } from "./MomentGrid";

// For local dev, a media key IS a public path under /public. Later this becomes
// a signed URL (D7). Centralised here so there's one place to change.
function resolveMediaSrc(key: string): string {
  return key; // dev: keys are already "/media/seed/..." public paths
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const location = await db.location.findUnique({
    where: { slug },
    include: {
      moments: {
        // Only approved + public moments, newest first (the public feed rule).
        where: { status: "APPROVED", isPublic: true },
        orderBy: { createdAt: "desc" },
        include: {
          media: {
            where: { status: "APPROVED" },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  if (!location || location.status !== "APPROVED") {
    notFound();
  }

  const details = LocationDetailsSchema.parse(location.details ?? {});

  // Shape moments for the client viewer (only what it needs; nothing private).
  const moments: ViewerMoment[] = location.moments
    .filter((m) => m.media.length > 0)
    .map((m) => ({
      id: m.id,
      caption: m.caption,
      createdAt: m.createdAt.toISOString(),
      media: m.media.map((mm) => ({
        id: mm.id,
        src: resolveMediaSrc(mm.mediaKey),
      })),
    }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
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

      <section className="mt-12 border-t border-neutral-200 pt-8 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">
          Experiences here
        </h2>
        <MomentGrid moments={moments} />
      </section>
    </main>
  );
}
