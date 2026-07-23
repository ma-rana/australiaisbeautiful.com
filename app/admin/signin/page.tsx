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

  const field =
    "mt-1 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

  // --- Step 2: code screen ---
  if (step === "code") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
        <div className="mb-2 text-xs uppercase tracking-widest text-neutral-500">
          Step 2 of 2
        </div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Enter your code
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Open your authenticator app and enter the current 6-digit code for{" "}
          <span className="text-neutral-700 dark:text-neutral-300">{email}</span>.
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
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-4 text-center text-2xl tracking-[0.4em] dark:border-neutral-700"
          />

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending || totp.trim().length < 6}
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {isPending ? "Verifying…" : "Verify and sign in"}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm">
          <p className="text-neutral-500">
            Lost your phone? Enter one of your recovery codes above instead.
          </p>
          <button
            onClick={() => {
              setStep("credentials");
              setTotp("");
              setError(null);
            }}
            className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Back
          </button>
        </div>
      </main>
    );
  }

  // --- Step 1: credentials ---
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-2 text-xs uppercase tracking-widest text-neutral-500">
        Staff access
      </div>
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        Admin sign in
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Restricted. Curators, moderators and administrators only.
      </p>

      <form onSubmit={submitCredentials} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Email
          </label>
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
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Password
          </label>
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
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
