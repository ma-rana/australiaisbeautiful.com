"use server";

// app/admin/actions.ts — moderation actions.
//
// MODERATION MODEL: moments publish immediately, so these are POST-publication
// actions. The meaningful one is REMOVE — taking down something that's live and
// shouldn't be. (There's no "approve": it's already public.)
//
// Rules that still hold (MODERATION.md §4):
// - Every action runs requireModerator() — the real gate.
// - The action and its audit row happen in ONE transaction. An action that
//   isn't audited didn't happen.
// - The audit log is append-only — only ever created, never updated/deleted.
// - Removal requires a kind + reason (RejectSchema): the contributor is told
//   plainly why, and the record explains it later.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireModerator } from "@/lib/auth";
import { RejectSchema } from "@/lib/schemas/cooldown";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Remove a live moment: set it REMOVED, remove its media, write an audit row —
// all in one transaction. This is the takedown path for content that published
// immediately but shouldn't stay up.
export async function removeMoment(
  momentId: string,
  input: { kind: string; reason: string },
): Promise<ActionResult> {
  const actor = await requireModerator();

  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "A removal needs a kind and a clear reason." };
  }
  const { kind, reason } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      // Guarded: only takes down something currently live. If it's already been
      // removed (another moderator, a stale tab), count === 0 and we abort.
      const updated = await tx.moment.updateMany({
        where: { id: momentId, status: "APPROVED" },
        data: {
          status: "REMOVED",
          rejectionKind: kind,
          rejectionReason: reason,
          moderatedById: actor.id,
          moderatedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new Error("Already actioned by someone else.");
      }

      await tx.momentMedia.updateMany({
        where: { momentId },
        data: { status: "REMOVED", rejectionKind: kind, rejectionReason: reason },
      });

      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "REMOVE",
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

// Restore a removed moment (a takedown reconsidered). Audited like everything
// else — reversals are part of the record, not a way to erase one.
export async function restoreMoment(momentId: string): Promise<ActionResult> {
  const actor = await requireModerator();

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.moment.updateMany({
        where: { id: momentId, status: "REMOVED" },
        data: {
          status: "APPROVED",
          rejectionKind: null,
          rejectionReason: null,
          moderatedById: actor.id,
          moderatedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new Error("That moment isn't in a removed state.");
      }

      await tx.momentMedia.updateMany({
        where: { momentId },
        data: { status: "APPROVED", rejectionKind: null, rejectionReason: null },
      });

      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "RESTORE",
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
