"use server";

// app/contributions/actions.ts — managing your own contributions.
//
// PRIVATE BY DESIGN. This is the one place a person's contributions appear as a
// list, and only they can see it. There is no public profile, no "all moments by
// this Explorer" view for anyone else — that's the whole point of the anonymous
// equality the product is built on. If you ever find yourself needing to show
// one user another user's contribution list, stop: it contradicts the product.
//
// Ownership is checked on every action (requireOwner). A moderator is NOT an
// owner — staff act through the audited moderation actions, never through the
// owner path.

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getStorage } from "@/lib/media/storage";
import { revalidatePath } from "next/cache";

export type ContributionResult = { ok: true } | { ok: false; error: string };

// Toggle a moment between public and private. A contributor's own privacy
// control, independent of moderation: a moment must be APPROVED *and* isPublic
// to be visible. Hiding is instant and needs nobody's permission.
export async function setMomentVisibility(
  momentId: string,
  isPublic: boolean,
): Promise<ContributionResult> {
  const user = await requireUser();

  try {
    // Ownership check baked into the query — you can only touch your own.
    const updated = await db.moment.updateMany({
      where: { id: momentId, userId: user.id },
      data: { isPublic },
    });
    if (updated.count === 0) {
      return { ok: false, error: "That contribution isn't yours to change." };
    }

    const moment = await db.moment.findUnique({
      where: { id: momentId },
      select: { location: { select: { slug: true } } },
    });

    revalidatePath("/contributions");
    if (moment) revalidatePath(`/location/${moment.location.slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Edit a moment's field note. The photos are fixed once uploaded (re-processing
// is a different job), but the note is the actual product — people should be
// able to correct or improve it.
export async function updateMomentCaption(
  momentId: string,
  caption: string,
): Promise<ContributionResult> {
  const user = await requireUser();

  const trimmed = caption.trim();
  if (trimmed.length > 2000) {
    return { ok: false, error: "That note is too long (max 2000 characters)." };
  }

  try {
    const updated = await db.moment.updateMany({
      where: { id: momentId, userId: user.id },
      data: { caption: trimmed || null },
    });
    if (updated.count === 0) {
      return { ok: false, error: "That contribution isn't yours to change." };
    }

    const moment = await db.moment.findUnique({
      where: { id: momentId },
      select: { location: { select: { slug: true } } },
    });

    revalidatePath("/contributions");
    if (moment) revalidatePath(`/location/${moment.location.slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Delete a moment permanently — the rows AND the stored files.
//
// This is a REAL delete, unlike a request being cleared (which is a hide,
// because a request row is tiny and its demand still counts). A moment carries
// actual files and an actual obligation: if someone withdraws their photos, the
// bytes should go, not just the visibility.
export async function deleteMoment(momentId: string): Promise<ContributionResult> {
  const user = await requireUser();

  try {
    const moment = await db.moment.findFirst({
      where: { id: momentId, userId: user.id },
      select: {
        id: true,
        location: { select: { slug: true, id: true, heroMediaId: true } },
        media: { select: { id: true, mediaKey: true, thumbKey: true } },
      },
    });
    if (!moment) {
      return { ok: false, error: "That contribution isn't yours to delete." };
    }

    // If one of these photos is the location's hero, clear it first — a hero
    // pointing at deleted media would leave the place faceless mid-render.
    const mediaIds = moment.media.map((m) => m.id);
    if (
      moment.location.heroMediaId &&
      mediaIds.includes(moment.location.heroMediaId)
    ) {
      await db.location.update({
        where: { id: moment.location.id },
        data: { heroMediaId: null },
      });
    }

    // Rows first (MomentMedia cascades from Moment), then the files. If file
    // deletion fails the rows are already gone, which is the safe direction:
    // orphaned bytes are a cleanup job, orphaned rows are a broken page.
    await db.moment.delete({ where: { id: momentId } });

    const storage = getStorage();
    for (const m of moment.media) {
      // Seed/placeholder paths aren't storage-backed — skip them.
      if (m.mediaKey && !m.mediaKey.startsWith("/")) {
        await storage.delete(m.mediaKey);
      }
      if (m.thumbKey && !m.thumbKey.startsWith("/")) {
        await storage.delete(m.thumbKey);
      }
    }

    revalidatePath("/contributions");
    revalidatePath(`/location/${moment.location.slug}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
