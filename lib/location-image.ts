// lib/location-image.ts — the "a place must have a face" rule.
//
// A location with no image is a blank card: it looks broken and tells a visitor
// nothing. On a product whose whole premise is "the place is the hero", a place
// with no photo can't be the hero of anything. So a location cannot be
// PUBLISHED without one.
//
// What counts as having a face (either satisfies the rule):
//   - coverKey     — the curator's uploaded image
//   - heroMediaId  — a promoted community photo (an approved file on an
//                    approved, public moment at this location)
//
// In practice, at approval time a brand-new place has no contributions yet, so
// the curator must upload a cover. But a place that has real contributed photos
// shouldn't be blocked just because nobody uploaded a curator cover — hence the
// OR.
//
// SCOPE: this gates PUBLISHING (approve / save-as-approved). It deliberately
// does NOT retroactively hide places that are already live without an image —
// silently removing published content is worse than showing it while it gets
// fixed. Those are flagged in the admin list instead.

import { db } from "@/lib/db";

export type FaceCheck =
  | { ok: true }
  | { ok: false; reason: string };

// Does this location have a usable face right now?
export async function locationHasFace(locationId: string): Promise<boolean> {
  const loc = await db.location.findUnique({
    where: { id: locationId },
    select: { coverKey: true, heroMediaId: true },
  });
  if (!loc) return false;
  if (loc.coverKey) return true;
  if (!loc.heroMediaId) return false;

  // A hero only counts if the file is still approved and its moment public —
  // a hero pointing at removed content is not a face.
  const hero = await db.momentMedia.findFirst({
    where: {
      id: loc.heroMediaId,
      status: "APPROVED",
      moment: { status: "APPROVED", isPublic: true },
    },
    select: { id: true },
  });
  return !!hero;
}

// Would this location have a face, given a pending change? Used at approval and
// edit time, where a new cover may be arriving in the same request.
export function checkFace(opts: {
  incomingCover: boolean; // a cover image is being uploaded in this request
  existingCoverKey: string | null;
  hasUsableHero: boolean;
}): FaceCheck {
  if (opts.incomingCover || opts.existingCoverKey || opts.hasUsableHero) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      "A place needs an image before it can go live — upload a cover photo, or set one of its contributed photos as the face.",
  };
}
