// app/media/[...key]/route.ts — serve stored media.
//
// Media lives OUTSIDE /public (MEDIA.md), so it's served through this route,
// which reads from the storage driver. This is where signed-URL verification
// will live (D7). For NOW (dev), it serves approved media by key without a
// signature — the signing layer is a deliberate TODO, called out loudly so it
// isn't forgotten before production.
//
// SECURITY TODO (before production, SECURITY.md / MEDIA.md):
//   - Require a signed, short-TTL token (verify HMAC of key+expiry).
//   - Only serve media whose MomentMedia.status = APPROVED (and moment public),
//     so PENDING/REJECTED bytes aren't reachable by guessing keys.
//   Right now this serves any valid key. Acceptable for local dev ONLY.

import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/media/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: parts } = await params;
  const key = parts.join("/");

  // Only serve from known media prefixes (defence in depth alongside the
  // storage driver's own path-escape guard).
  //   moments/ — community contributions
  //   covers/  — curator-uploaded location covers
  if (!key.startsWith("moments/") && !key.startsWith("covers/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const storage = getStorage();
    const bytes = await storage.read(key);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        // Short cache in dev; production caching pairs with signed URLs.
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
