"use server";

// components/map/nearby-actions.ts — places near a point.
//
// Lives beside MapView rather than in a route folder because MapView is its
// only caller — app/page.tsx never touches it. The other actions in this
// codebase sit in route folders for the same reason: next to what calls them.
//
// The first real use of the PostGIS geography column and its GIST index
// (see the postgis migration). ST_DWithin on a geography type does true
// great-circle distance in metres, and the index makes it fast without scanning
// every row.
//
// PRIVACY (D8, "remembers experiences, not movements"):
// The coordinates arrive, get used for one query, and are discarded. Nothing is
// written — no search history, no last-known-position, no user association. The
// only thing that persists from a "near me" is what the person chooses to do
// next. If you ever find yourself wanting to log these for analytics, don't:
// that's movement tracking with a friendlier name.

import { db } from "@/lib/db";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { NEARBY_SEARCH_RADIUS_KM } from "@/lib/constants";

export type NearbyPlace = {
  slug: string;
  name: string;
  place: string;
  /** Category, human-readable lowercase ("national park"). */
  kind: string;
  /** The place's face — hero photo, else curator cover. Signed URL or null. */
  face: string | null;
  latitude: number;
  longitude: number;
  metres: number;
};

export type NearbyResult =
  | { ok: true; places: NearbyPlace[] }
  | { ok: false; error: string };

// Places within `radiusKm` of a point, nearest first.
export async function placesNear(
  latitude: number,
  longitude: number,
  radiusKm = NEARBY_SEARCH_RADIUS_KM,
): Promise<NearbyResult> {
  // Sanity-check the inputs — these come from the browser.
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return { ok: false, error: "Those coordinates don't look right." };
  }

  const metres = Math.min(Math.max(radiusKm, 1), 500) * 1000;

  try {
    // Raw SQL because Prisma has no notion of the geography column — it's
    // maintained by a trigger and queried here directly. ST_DWithin uses the
    // GIST index; ST_Distance gives the actual metres for display.
    //
    // The LEFT JOIN pulls the place's FACE with the same priority every other
    // surface uses: the promoted hero photo (if still approved), else the
    // curator's provisional cover. A nearby list is a "go here?" pitch, and
    // the photo makes that case better than a name can.
    const rows = await db.$queryRaw<
      {
        slug: string;
        name: string;
        suburb: string | null;
        state: string;
        category: string;
        coverThumbKey: string | null;
        coverKey: string | null;
        heroThumb: string | null;
        heroMedia: string | null;
        latitude: number;
        longitude: number;
        metres: number;
      }[]
    >`
      SELECT
        l.slug,
        l.name,
        l.suburb,
        l.state::text AS state,
        l.category::text AS category,
        l."coverThumbKey" AS "coverThumbKey",
        l."coverKey" AS "coverKey",
        hero."thumbKey" AS "heroThumb",
        hero."mediaKey" AS "heroMedia",
        l.latitude,
        l.longitude,
        ST_Distance(
          l.geog,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) AS metres
      FROM "Location" l
      LEFT JOIN "MomentMedia" hero
        ON hero.id = l."heroMediaId" AND hero.status = 'APPROVED'
      WHERE l.status = 'APPROVED'
        AND ST_DWithin(
          l.geog,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${metres}
        )
      ORDER BY l.geog <-> ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      LIMIT 20
    `;

    return {
      ok: true,
      places: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        place: [r.suburb, r.state].filter(Boolean).join(", "),
        kind: r.category.toLowerCase().replace(/_/g, " "),
        face: resolveMediaSrc(
          r.heroThumb ?? r.heroMedia ?? r.coverThumbKey ?? r.coverKey,
        ),
        latitude: r.latitude,
        longitude: r.longitude,
        metres: Number(r.metres),
      })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't search nearby.",
    };
  }
}
