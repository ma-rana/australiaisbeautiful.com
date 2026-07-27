"use client";

// app/signin/SignInForm.tsx — the interactive half of /signin.
//
// The PAGE (page.tsx) is a server component: it checks the session and
// redirects signed-in visitors away before this form ever renders — a signed-in
// person on a sign-in form is a state that shouldn't exist. This file is only
// the form.
//
// TWO STEPS if the account has 2FA on: credentials first, then a dedicated code
// screen. Explorers can enable 2FA too, and a code deserves its own screen
// rather than a third field under the password.

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, FIELD, LABEL, PRIMARY } from "@/components/AuthShell";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { safeCallbackUrl } from "@/lib/safe-callback";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sanitized: a callbackUrl from the query string is attacker-writable, and
  // pushing an absolute URL would make this page an open redirect.
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

  const [step, setStep] = useState<"credentials" | "code">("credentials");
  // Google leads; the email/password form stays folded away until asked for.
  // Most public contributors take the one-tap path, so the password fields are
  // the fallback, not the default — revealed on demand rather than competing
  // with the primary action.
  const [showEmail, setShowEmail] = useState(false);
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
      <AuthShell plate="S 33.8688°  E 151.2093°">
        <p className="specimen-label text-[var(--ochre)]">Second factor</p>
        <h1
          className="mt-3 text-[2rem] leading-[1.1] tracking-tight text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Enter your code
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">
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
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-4 text-center text-2xl tracking-[0.4em] text-[var(--ink)] placeholder:text-[var(--muted)]/40 transition-colors focus:border-[var(--eucalypt)] focus:outline-none focus:ring-2 focus:ring-[var(--eucalypt)]/20"
          />

          {error && (
            <p className="text-sm text-[var(--ochre)]" role="alert">
              {error}
            </p>
          )}

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
    <AuthShell plate="S 33.8688°  E 151.2093°">
      <p className="specimen-label text-[var(--ochre)]">Explorer sign-in</p>
      <h1
        className="mt-3 text-[2rem] leading-[1.1] tracking-tight text-[var(--ink)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Welcome back
      </h1>
      <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">
        Sign in to add your photos and field notes to the places you&apos;ve
        been.
      </p>

      <div className="mt-8">
        <GoogleButton callbackUrl={callbackUrl} />
      </div>

      {showEmail ? (
        <>
          <OrDivider />
          <form onSubmit={submitCredentials} className="space-y-4">
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

            {error && (
              <p className="text-sm text-[var(--ochre)]" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={isPending} className={PRIMARY}>
              {isPending ? "Checking…" : "Continue"}
            </button>
          </form>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="mt-4 w-full text-center text-[13px] text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--ink)]"
        >
          Continue with email instead
        </button>
      )}

      <div className="mt-7 border-t border-[var(--border)] pt-5 text-center text-sm text-[var(--muted)]">
        New here?{" "}
        <Link
          href={`/signup${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
          className="font-medium text-[var(--eucalypt)] underline underline-offset-4"
        >
          Create an account
        </Link>
      </div>
    </AuthShell>
  );
}
