"use server";

// app/admin/locations/takedown-actions.ts — removing a place from the map.
//
// THE AUTHORITY SPLIT (deliberate):
//   - CURATOR can add places and edit them, but CANNOT remove one. They REQUEST
//     a takedown, which an admin decides on.
//   - ADMIN can archive/restore directly, and rules on curator requests.
//
// Why the asymmetry: approving a bad place is a mistake you can undo. Removing a
// good place destroys other people's contributions and users notice. The
// destructive direction gets the stricter gate — same principle as ROLE_GRANT
// being admin-only.
//
// ARCHIVE, NOT DELETE, is the normal action. A location has contributed moments
// hanging off it — photos and field notes from people who did nothing wrong.
// Archiving takes the place off the map and preserves all of that, and is
// reversible. Hard delete exists only for genuine errors (a place created by
// mistake, with nothing on it) and refuses to run if contributions exist.
//
// Requests use the Escalation model, which was designed for exactly this: a
// staff member wanting a decision from someone with more authority.

import { db } from "@/lib/db";
import { requireCurator, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type TakedownResult = { ok: true } | { ok: false; error: string };

// CURATOR+: ask an admin to take a place down. Doesn't remove anything.
export async function requestLocationTakedown(
  locationId: string,
  reason: string,
): Promise<TakedownResult> {
  const actor = await requireCurator();

  const detail = reason.trim();
  if (detail.length < 15) {
    return {
      ok: false,
      error: "Explain why this place should come down (at least 15 characters).",
    };
  }

  try {
    const location = await db.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, slug: true },
    });
    if (!location) return { ok: false, error: "That place no longer exists." };

    // Don't stack duplicate requests for the same place.
    const open = await db.escalation.findFirst({
      where: {
        targetType: "LOCATION",
        targetId: locationId,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      select: { id: true },
    });
    if (open) {
      return {
        ok: false,
        error: "There's already an open takedown request for this place.",
      };
    }

    await db.$transaction(async (tx) => {
      await tx.escalation.create({
        data: {
          raisedById: actor.id,
          severity: "NORMAL",
          category: "JUDGEMENT_CALL",
          targetType: "LOCATION",
          targetId: locationId,
          detail: `Takedown requested for "${location.name}": ${detail}`,
          status: "OPEN",
        },
      });
      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "ESCALATE",
          targetType: "LOCATION",
          targetId: locationId,
          note: `Takedown requested: ${detail}`,
        },
      });
    });

    revalidatePath("/takedowns");
    revalidatePath(`/locations/${locationId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ADMIN ONLY: take a place off the map. Contributions are preserved.
export async function archiveLocation(
  locationId: string,
  reason: string,
): Promise<TakedownResult> {
  const actor = await requireAdmin();

  const detail = reason.trim();
  if (detail.length < 10) {
    return { ok: false, error: "Give a reason (at least 10 characters)." };
  }

  try {
    const location = await db.location.findUnique({
      where: { id: locationId },
      select: { id: true, slug: true, status: true },
    });
    if (!location) return { ok: false, error: "That place no longer exists." };
    if (location.status === "ARCHIVED") {
      return { ok: false, error: "That place is already archived." };
    }

    await db.$transaction(async (tx) => {
      await tx.location.update({
        where: { id: locationId },
        data: {
          status: "ARCHIVED",
          moderatedById: actor.id,
          moderatedAt: new Date(),
          rejectionReason: detail,
        },
      });

      // Close any open takedown request for this place — it's been actioned.
      await tx.escalation.updateMany({
        where: {
          targetType: "LOCATION",
          targetId: locationId,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
        data: {
          status: "RESOLVED",
          closedById: actor.id,
          closedAt: new Date(),
          resolution: `Archived: ${detail}`,
        },
      });

      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "REMOVE",
          targetType: "LOCATION",
          targetId: locationId,
          note: `Archived: ${detail}`,
        },
      });
    });

    revalidatePath("/takedowns");
    revalidatePath("/locations");
    revalidatePath(`/location/${location.slug}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ADMIN ONLY: put an archived place back on the map.
export async function restoreLocation(locationId: string): Promise<TakedownResult> {
  const actor = await requireAdmin();

  try {
    const location = await db.location.findUnique({
      where: { id: locationId },
      select: { slug: true, status: true },
    });
    if (!location) return { ok: false, error: "That place no longer exists." };
    if (location.status !== "ARCHIVED") {
      return { ok: false, error: "That place isn't archived." };
    }

    await db.$transaction(async (tx) => {
      await tx.location.update({
        where: { id: locationId },
        data: {
          status: "APPROVED",
          rejectionReason: null,
          moderatedById: actor.id,
          moderatedAt: new Date(),
        },
      });
      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "RESTORE",
          targetType: "LOCATION",
          targetId: locationId,
        },
      });
    });

    revalidatePath("/locations");
    revalidatePath(`/location/${location.slug}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ADMIN ONLY: decline a curator's takedown request — the place stays.
export async function dismissTakedownRequest(
  escalationId: string,
  note: string,
): Promise<TakedownResult> {
  const actor = await requireAdmin();

  const resolution = note.trim();
  if (resolution.length < 10) {
    return {
      ok: false,
      error: "Explain the decision (at least 10 characters) — the curator reads it.",
    };
  }

  try {
    const updated = await db.escalation.updateMany({
      where: { id: escalationId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      data: {
        status: "RESOLVED",
        closedById: actor.id,
        closedAt: new Date(),
        resolution: `Declined — place stays: ${resolution}`,
      },
    });
    if (updated.count === 0) {
      return { ok: false, error: "That request has already been closed." };
    }

    revalidatePath("/takedowns");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ADMIN ONLY: hard delete. Only for genuine errors — refuses if anyone has
// contributed to the place, because that would destroy their work.
export async function deleteLocationPermanently(
  locationId: string,
): Promise<TakedownResult> {
  const actor = await requireAdmin();

  try {
    const location = await db.location.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        slug: true,
        name: true,
        _count: { select: { moments: true } },
      },
    });
    if (!location) return { ok: false, error: "That place no longer exists." };

    if (location._count.moments > 0) {
      return {
        ok: false,
        error:
          "This place has contributions on it. Archive it instead — deleting would destroy other people's photos and notes.",
      };
    }

    await db.$transaction(async (tx) => {
      // Audit BEFORE the delete: the audit row outlives the target by design
      // (targetId is a loose string, not an FK).
      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "REMOVE",
          targetType: "LOCATION",
          targetId: locationId,
          note: `Permanently deleted "${location.name}" (no contributions)`,
        },
      });
      await tx.location.delete({ where: { id: locationId } });
    });

    revalidatePath("/locations");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
