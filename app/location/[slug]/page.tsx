// app/location/[slug]/page.tsx — a location page, as a field-guide entry.
//
// The place is the hero: name in the display serif, tagged with a specimen-style
// coordinate + locality label (the signature device). Facts are set quietly like
// a guide's margin notes. Moments (photos + field notes) are the living content.
//
// NEXT.JS 16: `params` is a Promise and must be awaited.

import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LocationDetailsSchema } from "@/lib/schemas/location";
import { MomentGrid, type ViewerMoment } from "./MomentGrid";

function resolveMediaSrc(key: string): string {
  return key; // dev: keys are already "/media/seed/..." public paths
}

// Decimal degrees → a specimen-label coordinate, e.g. "37.807°S 144.892°E".
function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns}  ${Math.abs(lng).toFixed(3)}°${ew}`;
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

  // Facts we actually know — set quietly, no invented data.
  const facts: { label: string; value: string }[] = [];
  if (location.address) facts.push({ label: "Where", value: location.address });
  if (details.entryFee?.free) facts.push({ label: "Entry", value: "Free" });
  if (details.bestTimeToVisit)
    facts.push({ label: "Best time", value: details.bestTimeToVisit });
  if (details.facilities?.length)
    facts.push({
      label: "Facilities",
      value: details.facilities
        .map((f) => f.toLowerCase().replace(/_/g, " "))
        .join(", "),
    });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:px-8">
      {/* Back to the index — quiet, top-left. */}
      <Link
        href="/"
        className="specimen-label transition-colors hover:text-[var(--ink)]"
      >
        ← All places
      </Link>

      {/* Field-guide header. The signature: the specimen coordinate label. */}
      <header className="mt-8 border-b border-[var(--border)] pb-8">
        <p className="specimen-label text-[var(--ochre)]">
          {formatCoords(location.latitude, location.longitude)}
          {"   ·   "}
          {location.suburb ? `${location.suburb}, ` : ""}
          {location.state}
        </p>
        <h1
          className="mt-4 text-5xl leading-[1.05] tracking-tight text-[var(--ink)] sm:text-6xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {location.name}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--foreground)]/85">
          {location.intro}
        </p>
      </header>

      {/* Facts — a quiet two-column margin-notes block. */}
      {facts.length > 0 && (
        <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {facts.map((f) => (
            <div
              key={f.label}
              className="flex gap-3 border-b border-[var(--border)]/60 pb-3"
            >
              <dt className="specimen-label w-24 shrink-0 pt-0.5">
                {f.label}
              </dt>
              <dd className="text-[var(--foreground)]/90 capitalize">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Experiences — the living content. */}
      <section className="mt-14">
        <h2 className="specimen-label">Experiences here</h2>
        <MomentGrid moments={moments} />
      </section>
    </main>
  );
}
