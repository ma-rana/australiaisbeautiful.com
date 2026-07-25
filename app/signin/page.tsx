// app/signin/page.tsx — public email/password sign-in, in the field-guide voice.
//
// The everyday door, for explorers. Staff accounts are refused here — their
// credentials work on the admin subdomain only (auth.ts door separation).
//
// The frame, field styles and the contour background live in AuthShell,
// shared with /signup so the two thresholds cannot drift apart. The
// SiteHeader deliberately doesn't render on either.
//
// TWO STEPS if the account has 2FA on: credentials first, then a dedicated code
// screen. Explorers can enable 2FA too, and a code deserves its own screen
// rather than a third field under the password.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, FIELD, LABEL, PRIMARY } from "@/components/AuthShell";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

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
          : "That email and password didn't match.",
      );
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
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
        door: "public",
        redirect: false,
      });
      finish(res ?? undefined, false);
    });
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        totp,
        door: "public",
        redirect: false,
      });
      finish(res ?? undefined, true);
    });
  };

  if (step === "code") {
    return (
      <AuthShell>
        <p className="specimen-label text-[var(--ochre)]">Second factor</p>
        <h1
          className="mt-3 text-3xl tracking-tight text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Enter your code
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          From your authenticator app, for{" "}
          <span className="text-[var(--ink)]/80">{email}</span>.
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
            className="w-full rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-4 text-center text-2xl tracking-[0.4em] text-[var(--ink)] placeholder:text-[var(--muted)]/50 transition-colors focus:border-[var(--eucalypt)] focus:outline-none focus:ring-2 focus:ring-[var(--eucalypt)]/20"
          />

          {error && <p className="text-sm text-[var(--ochre)]">{error}</p>}

          <button
            type="submit"
            disabled={isPending || totp.trim().length < 6}
            className={PRIMARY}
          >
            {isPending ? "Verifying…" : "Verify and sign in"}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm">
          <p className="text-[var(--muted)]">
            Lost your phone? Enter a recovery code above instead.
          </p>
          <button
            onClick={() => {
              setStep("credentials");
              setTotp("");
              setError(null);
            }}
            className="text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--ink)]"
          >
            Back
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="specimen-label text-[var(--ochre)]">Explorer sign-in</p>
      <h1
        className="mt-3 text-3xl tracking-tight text-[var(--ink)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Welcome back
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        Sign in to add your photos and field notes to the places you&apos;ve
        been.
      </p>

      <form onSubmit={submitCredentials} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className={LABEL}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={FIELD}
          />
        </div>

        {error && <p className="text-sm text-[var(--ochre)]">{error}</p>}

        <button type="submit" disabled={isPending} className={PRIMARY}>
          {isPending ? "Checking…" : "Continue"}
        </button>
      </form>

      <p className="mt-6 text-sm text-[var(--muted)]">
        New here?{" "}
        <Link
          href={`/signup${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
          className="text-[var(--eucalypt)] underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
