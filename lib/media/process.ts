// lib/media/process.ts — the secure image processing pipeline.
//
// This is the highest-risk code in the project (MEDIA.md). It is the reason the
// upload subsystem exists: it keeps two promises — "remembers experiences, not
// movements" (EXIF strip) and payload safety (re-encode) — and defends the box
// (decode limits, magic-byte sniff).
//
// ORDER IS SECURITY. Each step assumes the previous passed:
//   size → magic bytes → allowlist → decode-limit → re-encode(strip EXIF) → dims
// Never reorder. Never trust the client's Content-Type or extension.

import sharp from "sharp";

// Limits (mirror .env; hardcoded fallbacks are intentional belt-and-braces).
export const MAX_IMAGE_BYTES = Number(
  process.env.MEDIA_MAX_IMAGE_BYTES ?? 10 * 1024 * 1024,
); // 10 MB
const MAX_PIXELS = 40_000_000; // ~40MP decode ceiling — decompression-bomb guard
const DISPLAY_EDGE = 2400; // longest edge of the display variant
const THUMB_EDGE = 480; // longest edge of the thumb

// Real image magic bytes. Content-Type/extension are attacker-controlled and
// mean nothing; we sniff the actual header. NOTE: SVG is deliberately absent —
// it's executable XML and must never be accepted (SECURITY.md §4).
type Sniffed = "jpeg" | "png" | "webp" | "avif";

function sniffMagicBytes(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png";
  // WebP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";
  // AVIF: bytes 4..11 = "ftyp" then a major brand containing "avif"/"avis"
  const ftyp = buf.toString("ascii", 4, 8);
  if (ftyp === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return null;
}

export type ProcessedImage = {
  display: Buffer; // 2400px WebP — the location page
  thumb: Buffer; //   480px WebP — grid/preview
  meta: {
    width: number;
    height: number;
    byteSize: number; // of the display variant
    mimeType: "image/webp";
    exifStripped: true; // the receipt (MomentMediaMetaSchema requires literal)
  };
};

export type ProcessError =
  | "too_large"
  | "not_an_image"
  | "decode_failed"
  | "bad_dimensions";

// Process ONE image from its raw bytes. Returns the two variants + render meta,
// or a typed error. NEVER calls .withMetadata() — re-encoding drops EXIF (incl.
// GPS), which is the whole point.
export async function processImage(
  input: Buffer,
): Promise<{ ok: true; result: ProcessedImage } | { ok: false; error: ProcessError }> {
  // 1. Size — before anything is decoded into memory.
  if (input.length > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };

  // 2. Magic bytes — is it REALLY an allowed image?
  const kind = sniffMagicBytes(input);
  if (!kind) return { ok: false, error: "not_an_image" };

  try {
    // 3+4. Decode with a hard pixel ceiling (decompression-bomb guard).
    const base = sharp(input, { limitInputPixels: MAX_PIXELS });

    const metadata = await base.metadata();
    // 6. Dimension sanity — reject absurd or sub-thumbnail sizes.
    if (
      !metadata.width || !metadata.height ||
      metadata.width < 100 || metadata.height < 100
    ) {
      return { ok: false, error: "bad_dimensions" };
    }
    const ratio = metadata.width / metadata.height;
    if (ratio > 10 || ratio < 0.1) {
      return { ok: false, error: "bad_dimensions" };
    }

    // 5. Re-encode → fresh files the pipeline authored (kills polyglots/payloads).
    //    .rotate() FIRST applies EXIF orientation, THEN re-encode discards EXIF.
    //    (Portrait-lands-sideways is the classic bug if you strip before rotate.)
    const display = await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({
        width: DISPLAY_EDGE,
        height: DISPLAY_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    const thumb = await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({
        width: THUMB_EDGE,
        height: THUMB_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer();

    // Final dimensions come from the display variant (post-rotate/resize).
    const outMeta = await sharp(display).metadata();

    return {
      ok: true,
      result: {
        display,
        thumb,
        meta: {
          width: outMeta.width ?? DISPLAY_EDGE,
          height: outMeta.height ?? DISPLAY_EDGE,
          byteSize: display.length,
          mimeType: "image/webp",
          exifStripped: true,
        },
      },
    };
  } catch {
    return { ok: false, error: "decode_failed" };
  }
}
