// lib/media/sign.ts — signed, expiring media URLs.
//
// WHY (MEDIA.md / SECURITY.md D7):
// Storage keys are server-generated but not secret, and a plain key-based URL
// works forever for anyone who has it. That makes hotlinking and redistribution
// trivial, and — worse — it means a REMOVED photo stays reachable to anyone who
// saved the link, which defeats a takedown.
//
// The fix: a URL carries an expiry and an HMAC over (key + expiry). The server
// recomputes the MAC and refuses anything forged or stale. Links stop working
// on their own, so a leaked URL is a short-lived problem rather than a permanent
// one.
//
// This is NOT access control on its own — the serving route ALSO checks that the
// media is approved and its moment public (see app/media/[...key]/route.ts).
// Signing stops forgery and limits link lifetime; the status check decides who
// may see what. Both, always.

import { createHmac, timingSafeEqual } from "node:crypto";

// How long a media link stays valid. Short enough that a leaked URL dies
// quickly, long enough that a page open in a tab keeps rendering.
const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

function secret(): string {
  // Reuses AUTH_SECRET so there's one secret to manage and rotate. Rotating it
  // invalidates existing media links (and sessions), which is the correct
  // blast radius for a compromised secret.
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short — required to sign media URLs.",
    );
  }
  return s;
}

function computeMac(key: string, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`${key}:${expiresAt}`)
    .digest("base64url");
}

// Build a signed, relative URL for a storage key.
//   /media/moments/2026/07/abc/0-display.webp?e=1753...&s=Ab3...
export function signMediaUrl(
  key: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const mac = computeMac(key, expiresAt);
  return `/media/${key}?e=${expiresAt}&s=${mac}`;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "bad_signature" };

// Verify a request's expiry + signature for a key.
export function verifyMediaUrl(
  key: string,
  expiresParam: string | null,
  sigParam: string | null,
): VerifyResult {
  if (!expiresParam || !sigParam) return { ok: false, reason: "missing" };

  const expiresAt = Number(expiresParam);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "missing" };

  if (expiresAt < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }

  const expected = computeMac(key, expiresAt);
  // Constant-time compare — a fast-fail string compare leaks the signature a
  // byte at a time.
  const a = Buffer.from(expected);
  const b = Buffer.from(sigParam);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  return { ok: true };
}
