"use server";

// app/admin/actions.ts — moderation server actions.
//
// The real moderation core (MODERATION.md §3, §4, §6b):
// - Every action runs requireModerator() — the real gate (currently satisfied
//   by the temporary dev actor; hardens automatically when auth lands).
// - Approve/reject and the audit write happen in ONE transaction. An action
//   that isn't audited didn't happen (§4).
// - The audit log is append-only — we only ever create rows, never update/delete.
// - Reject requires a kind + reason (RejectSchema) and the kind drives any
//   cooldown (§6b). Moments themselves have NO cooldown, but the reason is still
//   recorded for the contributor and the audit trail.
//
// NOTE on the lease: the full claim/lease mechanic (§3) matters once there's
// more than one moderator. For the solo dev phase we act directly, but the
// approve/reject writes are still written defensively (updateMany guarded by
// current status) so they're race-safe and lease-ready to extend later.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireModerator } from "@/lib/auth";
import { RejectSchema } from "@/lib/schemas/cooldown";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Approve a moment: set it APPROVED, approve its pending media, write an audit
// row — all in one transaction.
export async function approveMoment(momentId: string): Promise<ActionResult> {
  const actor = await requireModerator();

  try {
    await db.$transaction(async (tx) => {
      // Guarded update: only transitions a PENDING moment. If it's already been
      // decided (another moderator, a stale tab), count === 0 and we abort.
      const updated = await tx.moment.updateMany({
        where: { id: momentId, status: "PENDING" },
        data: {
          status: "APPROVED",
          moderatedById: actor.id,
          moderatedAt: new Date(),
          claimedById: null,
          claimedAt: null,
          claimExpiresAt: null,
        },
      });
      if (updated.count === 0) {
        throw new Error("Already reviewed by someone else.");
      }

      // Approve the moment's pending media too (per-file status, MEDIA policy).
      await tx.momentMedia.updateMany({
        where: { momentId, status: "PENDING" },
        data: { status: "APPROVED" },
      });

      // Append-only audit, same transaction.
      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "APPROVE",
          targetType: "MOMENT",
          targetId: momentId,
        },
      });
    });

    revalidatePath("/admin/moments");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Reject a moment: requires a kind + reason. Moments carry NO cooldown (a bad
// frame says nothing about the next), but the reason is recorded for the
// contributor and the audit trail.
export async function rejectMoment(
  momentId: string,
  input: { kind: string; reason: string },
): Promise<ActionResult> {
  const actor = await requireModerator();

  // Validate the rejection (kind + reason) at the boundary.
  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "A rejection needs a kind and a clear reason." };
  }
  const { kind, reason } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.moment.updateMany({
        where: { id: momentId, status: "PENDING" },
        data: {
          status: "REJECTED",
          rejectionKind: kind,
          rejectionReason: reason,
          moderatedById: actor.id,
          moderatedAt: new Date(),
          claimedById: null,
          claimedAt: null,
          claimExpiresAt: null,
        },
      });
      if (updated.count === 0) {
        throw new Error("Already reviewed by someone else.");
      }

      await tx.momentMedia.updateMany({
        where: { momentId, status: "PENDING" },
        data: { status: "REJECTED", rejectionKind: kind, rejectionReason: reason },
      });

      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "REJECT",
          targetType: "MOMENT",
          targetId: momentId,
          note: `${kind}: ${reason}`,
        },
      });
    });

    revalidatePath("/admin/moments");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
