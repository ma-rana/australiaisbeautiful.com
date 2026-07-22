"use server";

// app/location/[slug]/reaction-actions.ts — the "worth it" reaction.
//
// DESIGN (schema: Reaction, D21):
// - ONE reaction type in v1: WORTH_IT. Deliberately NOT a heart/like. A heart
//   means "I like this person's post" — but there is no person here, and the
//   appreciation is for the PLACE and the usefulness of the contribution, not
//   affection for a contributor.
// - It applies to the whole MOMENT, not per-photo. Per-photo reactions would
//   create an implicit ranking WITHIN a set, which is the ordering this product
//   avoids everywhere.
// - One per user per moment (@@unique), tap to add, tap to undo.
// - The count NEVER sorts or ranks anything. It is quiet acknowledgement, not a
//   scoreboard. If you ever find yourself ordering by reactionCount, stop — that
//   is the popularity contest the product exists to avoid.
// - Reacting needs an account (the gentle wall). Viewing never does.

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ReactResult =
  | { ok: true; reacted: boolean; count: number }
  | { ok: false; error: "signin_required" | string };

// Toggle the current user's reaction on a moment. Returns the new state so the
// UI can settle without a refetch.
export async function toggleReaction(
  momentId: string,
  slug: string,
): Promise<ReactResult> {
  const user = await getSessionUser();
  // The gentle wall: the UI shows a sign-in prompt rather than an error.
  if (!user) return { ok: false, error: "signin_required" };

  try {
    const moment = await db.moment.findFirst({
      where: { id: momentId, status: "APPROVED", isPublic: true },
      select: { id: true },
    });
    if (!moment) return { ok: false, error: "That moment isn't available." };

    const existing = await db.reaction.findUnique({
      where: { momentId_userId: { momentId, userId: user.id } },
      select: { id: true },
    });

    // Toggle + keep the denormalized count in step, in one transaction so the
    // cache can't drift from the rows behind it.
    const reacted = !existing;
    await db.$transaction(async (tx) => {
      if (existing) {
        await tx.reaction.delete({ where: { id: existing.id } });
        await tx.moment.update({
          where: { id: momentId },
          data: { reactionCount: { decrement: 1 } },
        });
      } else {
        await tx.reaction.create({
          data: { momentId, userId: user.id, type: "WORTH_IT" },
        });
        await tx.moment.update({
          where: { id: momentId },
          data: { reactionCount: { increment: 1 } },
        });
      }
    });

    // Read the settled count from the rows, not the cache — cheap here, and it
    // self-heals if the cache ever drifted.
    const count = await db.reaction.count({ where: { momentId } });

    revalidatePath(`/location/${slug}`);
    return { ok: true, reacted, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
