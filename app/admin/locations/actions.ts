"use server";

// app/admin/locations/actions.ts — curator editing of published places.
//
// The curator has full editorial control over map entries: the write-up, the
// practical details, where the pin sits, the cover image, and which contributed
// photo becomes the place's face.
//
// Two distinct image concepts, deliberately (schema: Location):
//   - coverKey     — the CURATOR's uploaded image. Provisional; holds the space.
//   - heroMediaId  — a promoted COMMUNITY photo. Wins over the cover when set,
//                    because the face of a place should be a real photo from
//                    someone who went there.
//
// Everything is audited (MODERATION.md §4): the edit and its audit row are
// written in one transaction.

import { db } from "@/lib/db";
import { requireCurator } from "@/lib/auth";
import { LocationDetailsSchema } from "@/lib/schemas/location";
import { processImage } from "@/lib/media/process";
import { getStorage, coverKey } from "@/lib/media/storage";
import { locationHasFace } from "@/lib/location-image";
import { revalidatePath } from "next/cache";

export type EditResult = { ok: true } | { ok: false; error: string };

// Update a location's editorial content, details, position, and optionally its
// cover image.
export async function updateLocation(
  locationId: string,
  formData: FormData,
): Promise<EditResult> {
  const actor = await requireCurator();

  const s = (k: string) => String(formData.get(k) ?? "").trim();

  const name = s("name");
  const intro = s("intro");
  if (!name || intro.length < 20) {
    return {
      ok: false,
      error: "A place needs a name and a real intro (at least 20 characters).",
    };
  }

  try {
    const existing = await db.location.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        slug: true,
        status: true,
        coverKey: true,
        coverThumbKey: true,
        heroMediaId: true,
      },
    });
    if (!existing) return { ok: false, error: "That place no longer exists." };

    // Optional new cover — same security pipeline as any upload.
    let newCover: { display: string; thumb: string } | null = null;
    const coverFile = formData.get("cover");
    if (coverFile instanceof File && coverFile.size > 0) {
      const buf = Buffer.from(await coverFile.arrayBuffer());
      const processed = await processImage(buf);
      if (!processed.ok) {
        return {
          ok: false,
          error:
            processed.error === "too_large"
              ? "That cover image is too large (max 10 MB)."
              : processed.error === "not_an_image"
                ? "That cover file isn't a supported image."
                : "That cover image couldn't be processed.",
        };
      }
      const storage = getStorage();
      const dKey = coverKey(existing.slug, "display");
      const tKey = coverKey(existing.slug, "thumb");
      await storage.put(dKey, processed.result.display, "image/webp");
      await storage.put(tKey, processed.result.thumb, "image/webp");
      newCover = { display: dKey, thumb: tKey };
    }

    // A PUBLISHED place must have a face (lib/location-image.ts). Block a save
    // that would leave a live place with nothing to show. Not retroactive:
    // places already live without an image are flagged in the admin list, not
    // hidden — silently removing published content is worse.
    if (existing.status === "APPROVED" && !newCover) {
      const hasFace = await locationHasFace(locationId);
      if (!hasFace) {
        return {
          ok: false,
          error:
            "This place is live but has no image. Upload a cover, or set one of its contributed photos as the face, before saving.",
        };
      }
    }

    const details = LocationDetailsSchema.parse({
      bestTimeToVisit: s("bestTimeToVisit") || undefined,
      accessNotes: s("accessNotes") || undefined,
      facilities: formData.getAll("facilities").map(String).filter(Boolean).length
        ? formData.getAll("facilities").map(String).filter(Boolean)
        : undefined,
      entryFee: { free: formData.get("entryFeeFree") === "true", note: s("entryFeeNote") || undefined },
      warnings: s("warnings")
        ? s("warnings").split("\n").map((w) => w.trim()).filter(Boolean)
        : undefined,
      traditionalOwners: s("traditionalOwners") || undefined,
    });

    await db.$transaction(async (tx) => {
      await tx.location.update({
        where: { id: locationId },
        data: {
          name,
          intro,
          category: (s("category") || "OTHER") as never,
          state: (s("state") || "VIC") as never,
          suburb: s("suburb") || null,
          address: s("address") || null,
          latitude: Number(formData.get("latitude")) || undefined,
          longitude: Number(formData.get("longitude")) || undefined,
          details,
          ...(newCover
            ? { coverKey: newCover.display, coverThumbKey: newCover.thumb }
            : {}),
        },
      });

      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "EDIT",
          targetType: "LOCATION",
          targetId: locationId,
          note: newCover ? "Edited details + new cover image" : "Edited details",
        },
      });
    });

    revalidatePath("/admin/locations");
    revalidatePath(`/location/${existing.slug}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Promote a contributed photo to be the place's face. This is the one that
// matters: once a real photo from someone who went there exists, it should
// represent the place, superseding the curator's provisional cover.
//
// Pass null to clear the hero (falling back to the cover).
export async function setLocationHero(
  locationId: string,
  mediaId: string | null,
): Promise<EditResult> {
  const actor = await requireCurator();

  try {
    // If setting one, verify it's an approved photo actually belonging to a
    // public moment at THIS location — never trust an id from the client.
    if (mediaId) {
      const media = await db.momentMedia.findFirst({
        where: {
          id: mediaId,
          status: "APPROVED",
          moment: { locationId, status: "APPROVED", isPublic: true },
        },
        select: { id: true },
      });
      if (!media) {
        return { ok: false, error: "That photo isn't available for this place." };
      }
    }

    const location = await db.location.findUnique({
      where: { id: locationId },
      select: { slug: true },
    });

    await db.$transaction(async (tx) => {
      await tx.location.update({
        where: { id: locationId },
        data: { heroMediaId: mediaId },
      });
      await tx.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "EDIT",
          targetType: "LOCATION",
          targetId: locationId,
          note: mediaId ? `Set hero photo ${mediaId}` : "Cleared hero photo",
        },
      });
    });

    revalidatePath("/admin/locations");
    if (location) revalidatePath(`/location/${location.slug}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
