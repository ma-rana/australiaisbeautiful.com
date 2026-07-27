"use client";

// app/admin/signin/AdminSignInForm.tsx — the interactive half of the staff door.
//
// The PAGE (page.tsx) is a server component that bounces an already-signed-in
// staff session straight to the dashboard before this renders — same pattern
// as the public /signin, same reasons (see app/signin/page.tsx).
//
// TWO STEPS, TWO SCREENS. Credentials first; if the account has 2FA, the code
// gets its own screen rather than a third field bolted under the password.
// Stacking all three at once is muddled — it implies you might need the code
// before you've been asked for it, and buries the most important input at the
// bottom.

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function AdminSignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const finish = (res: { error?: string } | undefined, onCode: boolean) => {
    if (res?.error) {
      setError(
        onCode
          ? "That code didn't match. Try the current one from your app."
          : "Those credentials aren't valid for admin access. Staff accounts only.",
      );
      return;
    }
    router.push("/");
    router.refresh();
  };

  // Step 1 — credentials. If the account has 2FA, move to the code screen
  // rather than attempting a sign-in that's guaranteed to fail.
  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // The probe only answers after verifying the password, so it can't be
      // used to discover which accounts have 2FA.
      const probe = await fetch("/api/auth/needs-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const { needsCode } = (await probe.json()) as { needsCode: boolean };

      if (needsCode) {
        setStep("code");
        return;
      }

      const res = await signIn("credentials", {
        email,
        password,
        door: "admin",
        redirect: false,
      });
      finish(res ?? undefined, false);
    });
  };

  // Step 2 — the second factor.
  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        totp,
        door: "admin",
        redirect: false,
      });
      finish(res ?? undefined, true);
    });
  };

  const field = "admin-input mt-1.5";

  // The masthead tile + guarded-door framing, shared by both steps. The AIB
  // monogram is the same one the rail wears; the key glyph signals this is a
  // restricted door (password + TOTP), not the public one.
  const Masthead = () => (
    <div className="mb-7 flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[0.72rem] font-bold tracking-wide text-white"
        style={{ background: "var(--action)" }}
      >
        AIB
      </span>
      <div className="leading-tight">
        <p className="admin-eyebrow">Staff access</p>
        <p className="text-sm font-semibold">Australia Is Beautiful</p>
      </div>
    </div>
  );

  // --- Step 2: code screen ---
  if (step === "code") {
    return (
      <main className="admin-root flex min-h-screen flex-col justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="admin-panel px-6 py-7 shadow-sm">
            <Masthead />
            <div className="mb-5 flex items-center justify-between">
              <h1 className="text-lg font-semibold">Enter your code</h1>
              <span className="admin-eyebrow">Step 2 of 2</span>
            </div>
            <p className="-mt-3 mb-6 text-sm text-[var(--muted)]">
              Open your authenticator app and enter the current 6-digit code
              for <span className="text-[var(--ink)]">{email}</span>.
            </p>

            <form onSubmit={submitCode} className="space-y-4">
              <input
                type="text"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                placeholder="000000"
                inputMode="text"
                autoFocus
                autoComplete="one-time-code"
                className="admin-input admin-data py-4 text-center text-2xl tracking-[0.4em]"
              />

              {error && (
                <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isPending || totp.trim().length < 6}
                className="admin-btn admin-btn-primary w-full justify-center py-2.5"
              >
                {isPending ? "Verifying…" : "Verify and sign in"}
              </button>
            </form>

            <div className="mt-6 border-t border-[var(--line)] pt-4 text-center text-sm">
              <p className="text-[var(--muted)]">
                Lost your phone? Enter a recovery code above instead.
              </p>
              <button
                onClick={() => {
                  setStep("credentials");
                  setTotp("");
                  setError(null);
                }}
                className="mt-1.5 text-[var(--muted)] underline underline-offset-4 hover:text-[var(--ink)]"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // --- Step 1: credentials ---
  return (
    <main className="admin-root flex min-h-screen flex-col justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-sm">
        <div className="admin-panel px-6 py-7 shadow-sm">
          <Masthead />
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Restricted to curators, moderators and administrators.
          </p>

          <form onSubmit={submitCredentials} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                className={field}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={field}
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="admin-btn admin-btn-primary w-full justify-center py-2.5"
            >
              {isPending ? "Checking…" : "Continue"}
            </button>
          </form>
        </div>

        {/* The door tag — signals this is the guarded surface, and quietly points
            explorers back to where they belong. */}
        <p className="admin-eyebrow mt-5 text-center">
          Protected by two-factor ·{" "}
          <a
            href="https://australiaisbeautiful.com"
            className="underline underline-offset-4 hover:text-[var(--ink)]"
          >
            Not staff? Visit the public site
          </a>
        </p>
      </div>
    </main>
  );
}
