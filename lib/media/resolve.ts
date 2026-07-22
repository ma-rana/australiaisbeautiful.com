// lib/media/resolve.ts — turn a stored key into a renderable URL.
//
// One place that decides how a media key becomes a src. Everything that renders
// media goes through here, so the signing rule can't be forgotten in one corner
// of the app.
//
// Two cases:
//   - A legacy/seed path (starts with "/") is already a public file under
//     /public — returned as-is. These are dev placeholders only.
//   - A real storage key is SIGNED (lib/media/sign.ts): the URL carries an
//     expiry + HMAC, so it can't be forged and doesn't work forever.

import { signMediaUrl } from "./sign";

export function resolveMediaSrc(key: string | null | undefined): string | null {
  if (!key) return null;
  // Seed/placeholder assets living in /public — not storage-backed.
  if (key.startsWith("/")) return key;
  return signMediaUrl(key);
}
