"use server";

// app/nearby-actions.ts — places near a point.
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

export type NearbyPlace = {
  slug: string;
  name: string;
  place: string;
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
  radiusKm = 50,
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
    const rows = await db.$queryRaw<
      {
        slug: string;
        name: string;
        suburb: string | null;
        state: string;
        latitude: number;
        longitude: number;
        metres: number;
      }[]
    >`
      SELECT
        slug,
        name,
        suburb,
        state::text AS state,
        latitude,
        longitude,
        ST_Distance(
          geog,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) AS metres
      FROM "Location"
      WHERE status = 'APPROVED'
        AND ST_DWithin(
          geog,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${metres}
        )
      ORDER BY geog <-> ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      LIMIT 20
    `;

    return {
      ok: true,
      places: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        place: [r.suburb, r.state].filter(Boolean).join(", "),
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
