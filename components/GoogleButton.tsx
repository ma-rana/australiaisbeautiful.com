"use client";

// components/GoogleButton.tsx — "Continue with Google" for the PUBLIC auth
// pages (/signin, /signup).
//
// PUBLIC SIDE ONLY. There is deliberately no Google button on the admin sign-in
// — staff authenticate with password + TOTP at their own door (see auth.ts).
// The gating lives server-side in the signIn callback regardless; this button
// simply isn't offered where it shouldn't be used.
//
// One shared component so both thresholds present the same control, and the
// callbackUrl is threaded through so a Google sign-in lands where a person was
// headed (already sanitized by the caller before it reaches here).

import { useState } from "react";
import { signIn } from "next-auth/react";

export function GoogleButton({
  callbackUrl,
  label = "Continue with Google",
}: {
  callbackUrl: string;
  label?: string;
}) {
  const [isPending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        setPending(true);
        // redirect: true (default) — OAuth needs a full-page bounce to Google.
        // Auth.js validates callbackUrl against our redirect callback, so an
        // odd value can't send the user off-site.
        void signIn("google", { callbackUrl });
      }}
      className="flex w-full items-center justify-center gap-3 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3.5 py-2.5 text-[15px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--ink)]/[0.03] focus:outline-none focus:ring-2 focus:ring-[var(--eucalypt)]/20 disabled:opacity-60"
    >
      <GoogleMark />
      {isPending ? "Redirecting…" : label}
    </button>
  );
}

// Google's official four-colour "G". Fixed brand colours by design — a
// monochrome mark reads as off-brand and slightly untrustworthy for an OAuth
// button, which is the one place users DO look for the familiar logo.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 010-3.44V4.95H.96a9 9 0 000 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

// A labelled "or" divider, shared so both pages separate Google from the form
// the same way.
export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-xs text-[var(--muted)]">or</span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
