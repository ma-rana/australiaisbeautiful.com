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
import { revalidatePath } from "next/cache";
import { z } from "zod";

// How close two pins must be to be considered "the same place". 150m is a
// reasonable park/landmark radius — tight enough not to merge neighbours,
// loose enough that two people pinning opposite ends of a reserve still group.
const CLUSTER_RADIUS_METRES = 150;

const RequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  fromNearMe: z.boolean().default(false),
});

export type RequestResult =
  | { ok: true; status: "queued" | "already_rejected" | "already_exists"; message: string }
  | { ok: false; error: string };

export async function submitLocationRequest(input: {
  name: string;
  note?: string;
  latitude: number;
  longitude: number;
  fromNearMe?: boolean;
}): Promise<RequestResult> {
  // Suggesting a place needs an account (the gentle wall) — viewing never does.
  await requireUser();

  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { name, note, latitude, longitude, fromNearMe } = parsed.data;

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
