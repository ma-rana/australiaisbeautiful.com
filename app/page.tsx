// app/page.tsx — the home surface: the map.
//
// The map IS the homepage (D17). A place-first product should open with the
// places, spatially — "what's near me" and "what's out there" are the questions
// people actually arrive with, and a list can't answer either.
//
// The list view at /places still exists but nothing links to it any more — see
// the note in MapNav. Everything the map offers is open to everyone; no account
// is needed to look (UX §7b).

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { MapShell } from "@/components/map/MapShell";
import { MapNav } from "@/components/map/MapNav";
import type { MapPlace } from "@/components/map/MapView";

export default async function Home() {
  const user = await getSessionUser();
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
      {/* The map fills the whole surface. There is no header above it — the
          chrome floats on the map instead (MapNav, MapControls), which is what
          §7b means by "the map is the whole canvas". */}
      <div className="absolute inset-0">
        <MapShell places={places} />
      </div>

      <MapNav email={user?.email ?? null} />

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
