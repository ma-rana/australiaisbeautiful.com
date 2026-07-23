// app/admin/signin/page.tsx — the SEPARATE admin sign-in.
//
// Distinct from the public /signin. This is the staff door: only MODERATOR+
// pass, and it lives on the admin surface (the admin subdomain in production).
// An explorer signing in here is told this isn't an admin account.
//
// TWO STEPS, TWO SCREENS. Credentials first; if the account has 2FA, the code
// gets its own screen rather than a third field bolted under the password.
// Stacking all three at once is muddled — it implies you might need the code
// before you've been asked for it, and buries the most important input at the
// bottom.

"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminSignInPage() {
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

  const field = "admin-input mt-1";

  // --- Step 2: code screen ---
  if (step === "code") {
    return (
      <main className="admin-root flex min-h-screen flex-col justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-sm">
          <p className="admin-eyebrow">Step 2 of 2</p>
          <h1 className="mt-2 text-xl font-semibold">Enter your code</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Open your authenticator app and enter the current 6-digit code for{" "}
            <span className="text-[var(--ink)]">{email}</span>.
          </p>

          <form onSubmit={submitCode} className="mt-8 space-y-4">
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
              <p className="text-sm" style={{ color: "var(--danger)" }}>
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

          <div className="mt-6 space-y-2 text-center text-sm">
            <p className="text-[var(--muted)]">
              Lost your phone? Enter one of your recovery codes above instead.
            </p>
            <button
              onClick={() => {
                setStep("credentials");
                setTotp("");
                setError(null);
              }}
              className="text-[var(--muted)] underline underline-offset-4 hover:text-[var(--ink)]"
            >
              Back
            </button>
          </div>
        </div>
      </main>
    );
  }

  // --- Step 1: credentials ---
  return (
    <main className="admin-root flex min-h-screen flex-col justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-sm">
        <p className="admin-eyebrow">Staff access</p>
        <h1 className="mt-2 text-xl font-semibold">Australia Is Beautiful</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Restricted to curators, moderators and administrators.
        </p>

        <form onSubmit={submitCredentials} className="mt-8 space-y-4">
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
            <p className="text-sm" style={{ color: "var(--danger)" }}>
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
    </main>
  );
}
