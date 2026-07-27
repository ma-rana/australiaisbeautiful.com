import type { NextConfig } from "next";

// next.config.ts — build config + baseline security headers.
//
// These headers are defence-in-depth applied at the app layer so they hold even
// if the Nginx config drifts (SECURITY.md: don't rely on a single layer). Nginx
// ALSO sets HSTS and can host a stricter CSP; these are the floor, set once for
// every route.
//
// Deliberately NOT here yet: a full Content-Security-Policy. MapLibre needs
// `worker-src blob:` and the app uses inline styles, so a wrong CSP silently
// breaks the map. When we add one it goes in Report-Only first (see the note at
// the bottom) — a header that breaks the product on deploy is worse than the
// gap it closes.

const securityHeaders = [
  // Don't let the browser second-guess declared content types — the classic
  // "upload a .jpg that's actually HTML and get it interpreted" defence. The
  // media route sets this per-response too; this covers everything else.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // No framing, anywhere. There is no legitimate reason for this app (public
  // OR admin) to be embedded in an iframe, and forbidding it kills clickjacking
  // outright. X-Frame-Options for old browsers; CSP frame-ancestors is the
  // modern equivalent and the one that actually matters now.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

  // Send the full URL only to same-origin; cross-origin gets just the origin.
  // Keeps query strings (which can carry callbackUrl, place ids) off the wire
  // to third parties, without breaking same-origin analytics/referrers.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // This app asks for none of these. Deny them so a compromised script (or an
  // embedded third-party) can't reach for the camera, mic, or geolocation —
  // note the PUBLIC map's "near me" uses the browser geolocation prompt, so if
  // that ever moves server-side or breaks, it's this line to revisit. Today the
  // "near me" flow runs client-side before any of this matters; confirm on the
  // map after deploy and loosen `geolocation=(self)` if the prompt is blocked.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework/version — one less free hint for an attacker
  // matching known-CVE fingerprints.
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Every route. The admin-specific no-store/noindex headers still come
        // from middleware.ts on the admin host; these are the universal floor.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

// --- When you add a full CSP (later) ----------------------------------------
// Start in Report-Only so nothing breaks silently:
//   { key: "Content-Security-Policy-Report-Only", value: "<policy>" }
// A workable starting policy for this stack (tighten from here):
//   default-src 'self';
//   img-src 'self' data: blob:;              // media route + map tiles/blobs
//   worker-src 'self' blob:;                 // MapLibre spins up workers
//   style-src 'self' 'unsafe-inline';        // inline styles in components
//   script-src 'self';                       // no inline scripts — keep it so
//   connect-src 'self';
//   frame-ancestors 'none';
//   base-uri 'self';
//   form-action 'self';
// Watch the console for violation reports for a week, fold in anything
// legitimate (the pmtiles/tile origin if tiles ever move off-origin), THEN
// swap Report-Only for the enforcing header.
