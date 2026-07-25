// lib/safe-callback.ts — sanitize a ?callbackUrl before navigating to it.
//
// The value arrives in the query string, which means anyone can write it:
// a crafted link like /signin?callbackUrl=https://evil.example would turn the
// sign-in flow into an open redirect — the classic phishing shape, where the
// victim signs in on the REAL site and lands on a fake one.
//
// Rule: only a same-site path is acceptable. Starts with exactly one "/"
// ("//evil.example" is a protocol-relative absolute URL, so one slash, not
// two), no backslashes (browsers normalize "\" to "/" in URLs, so "/\evil"
// becomes "//evil"). Anything else falls back to home.
//
// Used on BOTH sides: the server pages (redirect for already-signed-in
// visitors) and the client forms (router.push after auth) — same rule, one
// place.

export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.includes("\\")) return "/";
  return raw;
}
