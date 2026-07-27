"use server";

// app/admin/messages/actions.ts — work the public support inbox.
//
// One action: mark a message RESOLVED. There's no approve/reject here — a
// support message isn't content to be judged, it's a task to be handled. The
// resolution is by fixing the thing (or replying by email out of band); this
// just records that it's done, with an optional internal note.
//
// Resolution is audited in the same transaction (targetType SUPPORT), same as
// every other queue. Moderator+ — the same people who work the moment queue.

import { db } from "@/lib/db";
import { requireModerator } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type MessageActionResult = { ok: true } | { ok: false; error: string };

export async function resolveMessage(
  id: string,
  note?: string,
): Promise<MessageActionResult> {
  const actor = await requireModerator();

  const trimmed = (note ?? "").trim().slice(0, 1000) || null;

  try {
    await db.$transaction(async (tx) => {
      // updateMany with a status guard so two admins resolving at once don't
      // both "win" — the second finds nothing OPEN and we tell them so.
      const updated = await tx.supportMessage.updateMany({
        where: { id, status: "OPEN" },
        data: {
          status: "RESOLVED",
          resolvedById: actor.id,
          resolvedAt: new Date(),
          resolutionNote: trimmed,
        },
      });
      if (updated.count === 0) {
        throw new Error("That message was already resolved by someone else.");
      }

      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "SUPPORT_RESOLVE",
          targetType: "SUPPORT",
          targetId: id,
          note: trimmed ?? undefined,
        },
      });
    });

    revalidatePath("/admin/messages");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Reopen a resolved message — in case it was closed prematurely. Also audited.
export async function reopenMessage(
  id: string,
): Promise<MessageActionResult> {
  const actor = await requireModerator();

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.supportMessage.updateMany({
        where: { id, status: "RESOLVED" },
        data: {
          status: "OPEN",
          resolvedById: null,
          resolvedAt: null,
          resolutionNote: null,
        },
      });
      if (updated.count === 0) {
        throw new Error("That message isn't resolved.");
      }
      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "RESTORE",
          targetType: "SUPPORT",
          targetId: id,
          note: "Reopened",
        },
      });
    });

    revalidatePath("/admin/messages");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
