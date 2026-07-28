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
import { formatCategory } from "@/lib/category";
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
      category: true,
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
    // Human-readable category for the preview sheet's specimen line, matching
    // the nearby rows. OTHER/unknown resolve to "" so the sheet shows just the
    // locality rather than the non-word "other".
    kind: formatCategory(l.category),
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
        // Positioned to clear the bottom-right control stack (MapControls sits
        // at bottom-4/right-3 on mobile, ~4 buttons tall). On phones the pill
        // sits well ABOVE that column so the two never overlap, and it's padded
        // off the very bottom edge — content at bottom-8 can hide behind the
        // mobile browser's address bar / home indicator, so we lift it and add
        // the safe-area inset. On desktop the controls are a compact bottom-
        // right cluster and the centred pill has room, so it drops back down.
        // Inset from the right on mobile so a long line can't run under the
        // control column.
        <div
          className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center px-4 pr-16 sm:bottom-8 sm:pr-4"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <p className="pointer-events-auto max-w-[calc(100vw-5rem)] rounded-full border border-[var(--border)] bg-[var(--paper)]/95 px-5 py-2.5 text-center text-sm text-[var(--muted)] shadow-sm backdrop-blur">
            The first places are being added.
          </p>
        </div>
      )}
    </div>
  );
}
