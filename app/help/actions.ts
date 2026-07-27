"use server";

// app/help/actions.ts — receive a public support / help / bug message.
//
// Open to signed-out visitors by design (a broken sign-up is exactly what you
// most need reported, and that person has no account). So: Zod at the boundary,
// per-IP rate limit, and NOTHING trusted from the client beyond the message,
// category, optional email, and the current path. userId is read from the
// session server-side if present — never accepted from input.
//
// One-way: this only CREATES a SupportMessage. There is no reply channel (D23).

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { consume, LIMITS } from "@/lib/rate-limit";
import { SupportSchema } from "@/lib/schemas/support";

export type SupportResult = { ok: true } | { ok: false; error: string };

export async function sendSupportMessage(input: {
  category: string;
  body: string;
  email?: string;
  path?: string;
}): Promise<SupportResult> {
  const parsed = SupportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check your message.",
    };
  }
  const { category, body, email, path } = parsed.data;

  const h = await headers();

  // Per-IP ceiling. Behind Nginx the client rides in x-forwarded-for; prefer
  // x-real-ip (Nginx-set, unspoofable) and fall back to the first XFF hop.
  const ip =
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rl = consume(`support:${ip}`, LIMITS.SUPPORT_IP);
  if (!rl.ok) {
    return {
      ok: false,
      error:
        "You've sent a few messages just now — please wait a little before sending another.",
    };
  }

  // Link the sender only if genuinely signed in. Never from input.
  const user = await getSessionUser();

  // A coarse UA string helps reproduce bugs. Trimmed; never anything tracking.
  const userAgent = (h.get("user-agent") ?? "").slice(0, 512) || null;

  try {
    await db.supportMessage.create({
      data: {
        category: category as never,
        body,
        // A signed-in sender's account email is the best default contact, but
        // an explicit one they typed wins.
        email: email ?? user?.email ?? null,
        userId: user?.id ?? null,
        path: path ?? null,
        userAgent,
      },
    });
  } catch {
    return { ok: false, error: "Something went wrong sending that. Try again." };
  }

  return { ok: true };
}
