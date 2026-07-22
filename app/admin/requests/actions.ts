"use server";

// app/admin/requests/actions.ts — review location request clusters.
//
// The cluster is the reviewable unit, and the decision STICKS to it:
//   - APPROVE  → creates the real Location (as APPROVED) and links the cluster,
//                so future requests for the same spot are told "already here".
//   - REJECT   → the cluster is closed for good. Future requests join it
//                silently and get the honest reason back instantly; they never
//                re-enter this queue.
//
// Demand (requestCount) orders the queue but NEVER decides. A much-requested
// cafe still fails the rubric — popularity isn't quality.
//
// Both actions are audited in the same transaction as the decision.

import { db } from "@/lib/db";
import { requireCurator } from "@/lib/auth";
import { RejectSchema } from "@/lib/schemas/cooldown";
import { revalidatePath } from "next/cache";

export type ClusterActionResult = { ok: true } | { ok: false; error: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

// Approve a cluster into a real Location. The curator supplies the real content
// — the request name is a pointer, not final copy (the intro is written here,
// properly, because a location page is editorial).
export async function approveCluster(
  clusterId: string,
  input: {
    name: string;
    intro: string;
    category: string;
    state: string;
    suburb?: string;
  },
): Promise<ClusterActionResult> {
  const actor = await requireCurator();

  if (!input.name?.trim() || input.intro?.trim().length < 20) {
    return {
      ok: false,
      error: "A place needs a name and a real intro (at least 20 characters).",
    };
  }

  try {
    const cluster = await db.locationRequestCluster.findUnique({
      where: { id: clusterId },
      select: { id: true, latitude: true, longitude: true, status: true },
    });
    if (!cluster) return { ok: false, error: "That request no longer exists." };
    if (cluster.status !== "OPEN") {
      return { ok: false, error: "That request has already been decided." };
    }

    // Unique slug (append a short suffix if taken).
    let slug = slugify(input.name);
    const clash = await db.location.findUnique({ where: { slug } });
    if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    await db.$transaction(async (tx) => {
      const location = await tx.location.create({
        data: {
          slug,
          name: input.name.trim(),
          intro: input.intro.trim(),
          category: input.category as never,
          state: input.state as never,
          suburb: input.suburb?.trim() || null,
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          status: "APPROVED",
        },
        select: { id: true },
      });

      const updated = await tx.locationRequestCluster.updateMany({
        where: { id: clusterId, status: "OPEN" },
        data: {
          status: "APPROVED",
          locationId: location.id,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      if (updated.count === 0) throw new Error("Already decided by someone else.");

      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "APPROVE",
          targetType: "LOCATION",
          targetId: location.id,
          note: `Approved from request cluster ${clusterId}`,
        },
      });
    });

    revalidatePath("/admin/requests");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Reject a cluster. The decision sticks — future requests for the same place
// join this cluster and are told this reason immediately, never re-queueing.
export async function rejectCluster(
  clusterId: string,
  input: { kind: string; reason: string },
): Promise<ClusterActionResult> {
  const actor = await requireCurator();

  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "A rejection needs a kind and a reason (the requester reads it).",
    };
  }
  const { kind, reason } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.locationRequestCluster.updateMany({
        where: { id: clusterId, status: "OPEN" },
        data: {
          status: "REJECTED",
          rejectionKind: kind as never,
          rejectionReason: reason,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      if (updated.count === 0) throw new Error("Already decided by someone else.");

      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "REJECT",
          targetType: "LOCATION",
          targetId: clusterId,
          note: `${kind}: ${reason}`,
        },
      });
    });

    revalidatePath("/admin/requests");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
