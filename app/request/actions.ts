"use server";

// app/request/actions.ts — submit a location request.
//
// THE MODEL (schema: LocationRequest + LocationRequestCluster):
// An individual request is a DEMAND SIGNAL, not a reviewable item. Requests
// group by PROXIMITY into a CLUSTER, and the cluster is what a curator reviews
// — once. That solves two problems at once:
//
//   1. WANTED places: a cluster's requestCount surfaces high-demand places at
//      the top of the queue. Demand is a PRIORITY signal, never auto-approval —
//      popularity isn't quality (a much-requested cafe still fails the rubric).
//
//   2. UNWANTED places: once a cluster is REJECTED, the decision STICKS. Future
//      requests for the same place join the rejected cluster silently and never
//      re-enter the queue. The requester gets an instant honest answer instead
//      of a submission that lands on the curator's desk for the fiftieth time.
//
// Clustering uses PostGIS ST_DWithin against the cluster centroid (the geog
// column is trigger-maintained from lat/lng — see the postgis migration).

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { consume, LIMITS } from "@/lib/rate-limit";
import { DEDUP_RADIUS_M, ONSITE_RADIUS_M } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// How close two pins must be to be considered "the same place". The value and
// its reasoning live in lib/constants.ts, alongside the other radii — §7c wants
// them findable in one place rather than scattered across queries.
const CLUSTER_RADIUS_METRES = DEDUP_RADIUS_M;

// Ground distance between two points, in metres (haversine). Same formula the
// picker uses client-side; duplicated here because the server must not trust
// the client's on-site verdict — it re-derives it.
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const RequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // The WHY is REQUIRED, and its floor is deliberate: it's the only thing a
  // curator can actually judge a suggestion by. "nice spot" clears nothing;
  // twenty characters is the minimum at which "been twice, north track is the
  // good one" fits. An empty-note pin is exactly the "wrong request" that
  // wastes a queue slot — requiring the why filters it at the door.
  note: z
    .string()
    .trim()
    .min(20, "Tell us a little more — what makes it worth the trip?")
    .max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // The requester's OWN located position + fix accuracy, sent so the server
  // can verify on-site status itself. Optional at the type level (someone who
  // never located has none), but its ABSENCE means "not on-site", which the
  // enforcement below rejects. The old `fromNearMe` boolean is gone: a
  // client-asserted verdict is exactly what an attacker forges.
  originLat: z.number().min(-90).max(90).optional(),
  originLng: z.number().min(-180).max(180).optional(),
  originAccuracyM: z.number().min(0).max(100000).optional(),
});

export type RequestResult =
  | { ok: true; status: "queued" | "already_rejected" | "already_exists"; message: string }
  | { ok: false; error: string };

export async function submitLocationRequest(input: {
  name: string;
  note: string;
  latitude: number;
  longitude: number;
  originLat?: number;
  originLng?: number;
  originAccuracyM?: number;
}): Promise<RequestResult> {
  // Suggesting a place needs an account (the gentle wall) — viewing never does.
  const user = await requireUser();

  // Rate limit (SECURITY.md §11): each request can CREATE a cluster — a row a
  // human curator must eventually look at — so the ceiling protects the
  // queue, which is the scarcest resource in the whole pipeline.
  const rl = consume(`request:${user.id}`, LIMITS.REQUEST);
  if (!rl.ok) {
    return {
      ok: false,
      error:
        "You've suggested a lot of places today — give the curators a chance to catch up and try again tomorrow.",
    };
  }

  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { name, note, latitude, longitude, originLat, originLng, originAccuracyM } =
    parsed.data;

  // ON-SITE ENFORCEMENT, server-side (the client check is a courtesy; THIS is
  // the rule). The pin must sit within the on-site radius of the requester's
  // own located position. No position, or too far, = rejected. The fix's
  // accuracy widens the allowance so a poor GPS reading doesn't punish an
  // honest pin. `fromNearMe` is DERIVED here from geometry the server checked,
  // never taken from the client's word.
  const hasOrigin =
    originLat !== undefined && originLng !== undefined;
  const onSite =
    hasOrigin &&
    distanceM(latitude, longitude, originLat, originLng) <=
      ONSITE_RADIUS_M + (originAccuracyM ?? 0);

  if (!onSite) {
    return {
      ok: false,
      error:
        "Suggestions are made from the place itself. Use “Use my current location” and drop the pin inside the circle — if you're not there right now, save it for your next visit.",
    };
  }
  const fromNearMe = true; // proven by the server, not asserted by the client

  try {
    // 1. Is there already an APPROVED location right here? If so, the place is
    //    already on the map — tell them, don't queue anything.
    const existing = await db.$queryRaw<{ id: string; slug: string; name: string }[]>`
      SELECT id, slug, name FROM "Location"
      WHERE status = 'APPROVED'
        AND ST_DWithin(
          geog,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${CLUSTER_RADIUS_METRES}
        )
      LIMIT 1
    `;
    if (existing.length > 0) {
      return {
        ok: true,
        status: "already_exists",
        message: `${existing[0].name} is already on the map.`,
      };
    }

    // 2. Find a nearby cluster (any status — including REJECTED, deliberately).
    const nearby = await db.$queryRaw<
      { id: string; status: string; rejectionReason: string | null }[]
    >`
      SELECT id, status, "rejectionReason" FROM "LocationRequestCluster"
      WHERE ST_DWithin(
        geog,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${CLUSTER_RADIUS_METRES}
      )
      ORDER BY ST_Distance(
        geog,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      )
      LIMIT 1
    `;

    const cluster = nearby[0];

    // 3a. A REJECTED cluster: the decision sticks. Record the request (demand is
    //     still real and worth counting) but tell the requester honestly and
    //     DON'T re-open the cluster. It never re-enters the queue.
    if (cluster && cluster.status === "REJECTED") {
      await db.locationRequest.create({
        data: {
          clusterId: cluster.id,
          name,
          note: note ?? null,
          latitude,
          longitude,
          fromNearMe: fromNearMe ?? false,
        },
      });
      await db.locationRequestCluster.update({
        where: { id: cluster.id },
        data: { requestCount: { increment: 1 } },
      });

      return {
        ok: true,
        status: "already_rejected",
        message:
          cluster.rejectionReason ??
          "This place has been considered before and isn't a fit for the map.",
      };
    }

    // 3b. An OPEN cluster: join it, bump the demand count.
    if (cluster && cluster.status === "OPEN") {
      await db.locationRequest.create({
        data: {
          clusterId: cluster.id,
          name,
          note: note ?? null,
          latitude,
          longitude,
          fromNearMe: fromNearMe ?? false,
        },
      });
      await db.locationRequestCluster.update({
        where: { id: cluster.id },
        data: { requestCount: { increment: 1 } },
      });
    } else {
      // 3c. No cluster nearby: start one. This is the first person to want this
      //     place; the cluster is now the reviewable item.
      await db.locationRequestCluster.create({
        data: {
          latitude,
          longitude,
          displayName: name,
          status: "OPEN",
          requestCount: 1,
          requests: {
            create: {
              name,
              note: note ?? null,
              latitude,
              longitude,
              fromNearMe: fromNearMe ?? false,
            },
          },
        },
      });
    }

    revalidatePath("/admin/requests");
    return {
      ok: true,
      status: "queued",
      message: "Thanks — we'll take a look at this place.",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't submit that request.",
    };
  }
}
