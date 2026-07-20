// lib/schemas/moment.ts
// Zod schemas for Moment JSONB + the upload boundary.
//
// PRIVACY-CRITICAL: Moment.mediaMeta must NEVER carry EXIF GPS, camera serial,
// or timestamps beyond what the user intentionally shares. Photo EXIF is
// exactly the movement tracking this product promises not to do
// ("remembers experiences, not movements" — CLAUDE.md). Strip at the upload
// boundary, before this schema is ever populated.

import { z } from "zod";

// Moment.mediaMeta — render-only. Dimensions drive layout without a fetch;
// blurhash drives the placeholder.
export const MomentMediaMetaSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Videos only.
  durationSec: z.number().positive().optional(),
  // Compact placeholder string rendered before the image loads.
  blurhash: z.string().max(200).optional(),
  byteSize: z.number().int().positive(),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "video/mp4",
    "video/quicktime",
  ]),
  // Proof the strip ran. If this is false or missing, do NOT publish.
  exifStripped: z.literal(true),
});
export type MomentMediaMeta = z.infer<typeof MomentMediaMetaSchema>;

// Input boundary for creating a moment. Note what is NOT here: no author name,
// no attribution field. Contributor identity is never attached to a moment
// beyond the userId FK, which is private (see CLAUDE.md).
//
// A moment is a SET: one trip, one caption, several photos. `fileCount` is what
// the client declares; the upload handler must verify the actual files match.
export const MAX_FILES_PER_MOMENT = 10;

export const CreateMomentSchema = z.object({
  locationId: z.string().cuid(),
  type: z.enum(["PHOTO", "VIDEO", "EXPERIENCE"]),
  caption: z.string().max(2000).optional(),
  isPublic: z.boolean().default(true),
  // Why a cap: five deliberate photos of a walk is a contribution; forty is a
  // photo dump, and someone has to look at every one of them by hand. The
  // limit protects the moderation queue, which is the real bottleneck
  // (MODERATION.md §8).
  fileCount: z.number().int().min(0).max(MAX_FILES_PER_MOMENT),
}).refine(
  (m) => m.type !== "EXPERIENCE" || (m.caption?.trim().length ?? 0) > 0,
  { message: "A text experience needs a caption.", path: ["caption"] },
).refine(
  (m) => m.type === "EXPERIENCE" || m.fileCount > 0,
  { message: "A photo moment needs at least one photo.", path: ["fileCount"] },
).refine(
  (m) => m.type !== "EXPERIENCE" || m.fileCount === 0,
  { message: "A text experience carries no files.", path: ["fileCount"] },
);

// Reordering a set from the dashboard. Positions must be a contiguous 0..n-1
// permutation — gaps or duplicates would break the @@unique([momentId, position])
// constraint and leave the carousel in an undefined order.
export const ReorderMomentMediaSchema = z.object({
  momentId: z.string().cuid(),
  // mediaId in the contributor's chosen order; index = new position.
  order: z.array(z.string().cuid()).min(1).max(MAX_FILES_PER_MOMENT),
}).refine(
  (r) => new Set(r.order).size === r.order.length,
  { message: "Duplicate media in the order.", path: ["order"] },
);

// Rating input. Score bounds are enforced here AND by a Postgres CHECK
// constraint — belt and braces, because the cached Location.ratingAvg is only
// as trustworthy as the rows behind it.
export const CreateRatingSchema = z.object({
  locationId: z.string().cuid(),
  score: z.number().int().min(1).max(5),
});

export const CreateChatMessageSchema = z.object({
  locationId: z.string().cuid(),
  body: z.string().trim().min(1).max(1000),
});

export const CreateReportSchema = z.object({
  targetType: z.enum(["LOCATION", "MOMENT", "CHAT_MESSAGE", "ACTIVITY"]),
  targetId: z.string().cuid(),
  reason: z.enum([
    "INAPPROPRIATE",
    "COPYRIGHT",
    "WRONG_LOCATION",
    "SPAM",
    "SAFETY",
    "OTHER",
  ]),
  detail: z.string().max(1000).optional(),
});
