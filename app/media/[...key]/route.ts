// app/media/[...key]/route.ts — serve stored media, signed and status-checked.
//
// Media lives OUTSIDE /public (MEDIA.md), so it's served through this route.
// TWO independent gates, both required:
//
//   1. SIGNATURE — the URL carries an expiry + HMAC (lib/media/sign.ts). This
//      stops forged/guessed URLs and makes links short-lived, so a leaked link
//      isn't permanent. Signing alone is not authorisation.
//
//   2. STATUS — the bytes are only served if the media is genuinely publishable:
//      an APPROVED file on an APPROVED, public moment; or a location's cover.
//      This is what makes a takedown real: once a photo is REMOVED, even someone
//      holding a valid unexpired URL stops getting it.
//
// Without gate 2, "remove" would only hide a photo from the UI while the bytes
// stayed reachable — which is not a removal at all.

import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/media/storage";
import { verifyMediaUrl } from "@/lib/media/sign";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: parts } = await params;
  const key = parts.join("/");

  // Known media prefixes only (defence in depth alongside the storage driver's
  // own path-escape guard).
  if (!key.startsWith("moments/") && !key.startsWith("covers/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Gate 1 — signature + expiry.
  const url = new URL(req.url);
  const sig = verifyMediaUrl(key, url.searchParams.get("e"), url.searchParams.get("s"));
  if (!sig.ok) {
    // Deliberately vague: don't tell a prober whether a key exists, only that
    // this URL isn't valid.
    return new NextResponse("Not found", { status: 404 });
  }

  // Gate 2 — is this actually publishable right now?
  const publishable = await isPublishable(key);
  if (!publishable) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const storage = getStorage();
    const bytes = await storage.read(key);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        // Cache only as long as the signature is valid, and keep it private —
        // a shared cache must not serve these to someone without a valid URL.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

// A moment file is publishable when the file is APPROVED and its moment is
// APPROVED + public. A cover is publishable when it belongs to an APPROVED
// location. Anything else — pending, rejected, removed, archived — is not.
async function isPublishable(key: string): Promise<boolean> {
  if (key.startsWith("covers/")) {
    const loc = await db.location.findFirst({
      where: {
        status: "APPROVED",
        OR: [{ coverKey: key }, { coverThumbKey: key }],
      },
      select: { id: true },
    });
    return !!loc;
  }

  const media = await db.momentMedia.findFirst({
    where: {
      OR: [{ mediaKey: key }, { thumbKey: key }],
      status: "APPROVED",
      moment: { status: "APPROVED", isPublic: true },
    },
    select: { id: true },
  });
  return !!media;
}
