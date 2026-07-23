// app/page.tsx — the home surface: the map.
//
// The map IS the homepage (D17). A place-first product should open with the
// places, spatially — "what's near me" and "what's out there" are the questions
// people actually arrive with, and a list can't answer either.
//
// The list view still exists at /places for when you want to read rather than
// explore. Both are open to everyone; no account needed to look (UX §7b).

import Link from "next/link";
import { db } from "@/lib/db";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { MapShell } from "./MapShell";
import type { MapPlace } from "./MapView";

export default async function Home() {
  const locations = await db.location.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      slug: true,
      name: true,
      suburb: true,
      state: true,
      latitude: true,
      longitude: true,
      coverThumbKey: true,
      heroMediaId: true,
    },
  });

  const heroIds = locations.map((l) => l.heroMediaId).filter((x): x is string => !!x);
  const heroes = heroIds.length
    ? await db.momentMedia.findMany({
        where: { id: { in: heroIds }, status: "APPROVED" },
        select: { id: true, thumbKey: true, mediaKey: true },
      })
    : [];
  const heroById = new Map(heroes.map((h) => [h.id, h.thumbKey ?? h.mediaKey]));

  const places: MapPlace[] = locations.map((l) => ({
    id: l.id,
    slug: l.slug,
    name: l.name,
    place: [l.suburb, l.state].filter(Boolean).join(", "),
    latitude: l.latitude,
    longitude: l.longitude,
    face: resolveMediaSrc(
      (l.heroMediaId ? heroById.get(l.heroMediaId) : null) ?? l.coverThumbKey,
    ),
  }));

  return (
    <div className="relative flex-1">
      {/* The map fills the surface below the header. */}
      <div className="absolute inset-0">
        <MapShell places={places} />
      </div>

      {/* A quiet way through to the list, for reading rather than exploring. */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
        <Link
          href="/places"
          className="pointer-events-auto rounded-full border border-[var(--border)] bg-[var(--paper)]/95 px-4 py-2 text-sm shadow-sm backdrop-blur transition-colors hover:border-[var(--eucalypt)]"
        >
          Browse as a list
        </Link>
      </div>

      {places.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center px-4">
          <p className="pointer-events-auto rounded-full border border-[var(--border)] bg-[var(--paper)]/95 px-5 py-2.5 text-sm text-[var(--muted)] shadow-sm backdrop-blur">
            The first places are being added.
          </p>
        </div>
      )}
    </div>
  );
}
