"use server";

// app/contribute/actions.ts — the upload server action.
//
// Orchestrates the pipeline (MEDIA.md): requireUser → Zod boundary → per-file
// process (strip EXIF, re-encode, variants) → store → DB write → PUBLISHED.
//
// MODERATION MODEL (deliberate):
//   - LOCATION REQUESTS are gated — whether a place belongs on the map is
//     editorial judgement and needs approval before it exists.
//   - MOMENTS on an already-approved place publish IMMEDIATELY. The curation
//     happens at the map level, not on what people say about places that are
//     already there.
//
// Why: the scarcest resource is people willing to contribute. Pre-moderating
// every photo means the first-ever contributor uploads into silence and waits a
// day — the worst possible first experience for the exact behaviour the product
// most needs. Publishing immediately gives them "I added something to this
// place", which is the feeling that brings them back.
//
// The safety net is POST-publication: everything lands in a review list the
// moderator works through, plus user reports, plus removal at any time. If abuse
// ever appears, the tightening move is trusted-after-first (a brand-new user's
// first moment reviewed, instant thereafter) — not blanket pre-moderation.

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CreateMomentSchema, MAX_FILES_PER_MOMENT } from "@/lib/schemas/moment";
import { processImage } from "@/lib/media/process";
import { getStorage, mediaKey } from "@/lib/media/storage";
import { revalidatePath } from "next/cache";

export type UploadResult =
  | { ok: true; momentId: string }
  | { ok: false; error: string };

// Accepts a FormData with: locationId, caption, isPublic, and files[] (images).
export async function createMoment(formData: FormData): Promise<UploadResult> {
  // 1. Authz — must be signed in to contribute.
  const user = await requireUser();

  // 2. Pull + validate the non-file fields at the boundary.
  const locationId = String(formData.get("locationId") ?? "");
  const caption = String(formData.get("caption") ?? "").trim();
  const isPublic = formData.get("isPublic") !== "false";
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  const parsed = CreateMomentSchema.safeParse({
    locationId,
    type: "PHOTO", // v1: images only (MEDIA.md — no video on this box)
    caption: caption || undefined,
    isPublic,
    fileCount: files.length,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid submission." };
  }
  if (files.length === 0) return { ok: false, error: "Add at least one photo." };
  if (files.length > MAX_FILES_PER_MOMENT) {
    return { ok: false, error: `Up to ${MAX_FILES_PER_MOMENT} photos per moment.` };
  }

  // 3. The location must exist and be public (can't attach to a hidden place).
  const location = await db.location.findUnique({
    where: { id: locationId },
    select: { id: true, status: true },
  });
  if (!location || location.status !== "APPROVED") {
    return { ok: false, error: "That place isn't available." };
  }

  // 4. Process every file FIRST (strip EXIF, re-encode, variants). If any file
  //    fails the security pipeline, reject the whole submission before writing
  //    anything — no half-uploaded moments.
  const processed = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await processImage(buf);
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.error === "too_large"
            ? "One of your photos is too large (max 10 MB)."
            : result.error === "not_an_image"
              ? "One of your files isn't a supported image."
              : "One of your photos couldn't be processed. Try another.",
      };
    }
    processed.push(result.result);
  }

  // 5. Create the Moment (PUBLISHED) to get its cuid, then store files under
  //    keys derived from that cuid, then attach MomentMedia rows.
  //
  // MODERATION MODEL: moments publish IMMEDIATELY on an already-approved place.
  // The editorial gate is on WHICH PLACES EXIST (location requests are
  // reviewed), not on what people say about places that are already live. A
  // contributor uploading into a day of silence is the worst possible first
  // experience for the exact behaviour this product most needs; instant
  // publication gives them "it's there" straight away.
  //
  // Safety is POST-publication: everything lands in the admin review list, plus
  // reports, plus removal. Tighten to review-first-upload-then-trusted if abuse
  // ever appears — but don't pay the momentum cost before there's a problem.
  const storage = getStorage();
  try {
    const moment = await db.moment.create({
      data: {
        locationId: location.id,
        userId: user.id, // private FK; never shown publicly
        type: "PHOTO",
        status: "APPROVED", // live immediately — reviewable/removable after
        isPublic,
        caption: caption || null,
      },
      select: { id: true },
    });

    // Store variants + build the media rows.
    for (let i = 0; i < processed.length; i++) {
      const p = processed[i];
      const displayKey = mediaKey(moment.id, "display").replace(
        "/display.webp",
        `/${i}-display.webp`,
      );
      const thumbKey = mediaKey(moment.id, "thumb").replace(
        "/thumb.webp",
        `/${i}-thumb.webp`,
      );

      await storage.put(displayKey, p.display, "image/webp");
      await storage.put(thumbKey, p.thumb, "image/webp");

      await db.momentMedia.create({
        data: {
          momentId: moment.id,
          position: i,
          mediaKey: displayKey,
          thumbKey: thumbKey,
          status: "APPROVED", // live with its parent moment; removable after
          mediaMeta: p.meta, // includes exifStripped: true (the receipt)
        },
      });
    }

    // The moment is live immediately: refresh the place it's on, and the
    // admin review list where a moderator sees what was just published.
    revalidatePath("/admin/moments");
    return { ok: true, momentId: moment.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed. Please try again.",
    };
  }
}
