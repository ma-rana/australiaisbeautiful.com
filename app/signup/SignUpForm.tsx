"use client";

// app/signup/SignUpForm.tsx — the interactive half of /signup.
//
// The PAGE (page.tsx) is a server component: it bounces already-signed-in
// visitors before this renders. See app/signin/page.tsx for the reasoning —
// same pattern, same reasons.
//
// The shortest honest form that can exist: email, password, one button.
// No name, no handle, no avatar — signup collects nothing that could become
// a public identity, because there are no public identities here (D23).
//
// No confirm-password field, on purpose: it doubles the typing, catches
// almost nothing a "show password" toggle wouldn't, and signup friction is
// this product's scarcest-resource problem.

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, FIELD, LABEL, PRIMARY } from "@/components/AuthShell";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { safeCallbackUrl } from "@/lib/safe-callback";
import { createAccount } from "./actions";

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Google leads (one tap, no password to invent); the email form is the
  // fallback, folded away until asked for. Signup friction is this product's
  // scarcest-resource problem, so the lowest-friction path is the default.
  const [showEmail, setShowEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const created = await createAccount({ email, password });
      if (!created.ok) {
        setError(created.error);
        return;
      }

      // Straight through the front door — no "now go sign in" detour. A brand
      // new account has no 2FA, so the credentials flow completes in one step.
      const res = await signIn("credentials", {
        email,
        password,
        door: "public",
        redirect: false,
      });
      if (res?.error) {
        // Vanishingly rare (created but couldn't sign in) — send them to the
        // sign-in page rather than leaving them on a dead form.
        router.push("/signin");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    });
  };

  return (
    <AuthShell plate="S 25.3444°  E 131.0369°">
      <p className="specimen-label text-[var(--ochre)]">New explorer</p>
      <h1
        className="mt-3 text-[2rem] leading-[1.1] tracking-tight text-[var(--ink)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Create an account
      </h1>
      <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">
        An account here is for contributing — photos, field notes, ratings.
        There&apos;s no profile and no followers; your contributions belong to
        the places, not to a page about you.
      </p>

      <div className="mt-8">
        <GoogleButton callbackUrl={callbackUrl} label="Sign up with Google" />
      </div>

      {showEmail ? (
        <>
          <OrDivider />
          <form onSubmit={submit} className="space-y-4">
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
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className={LABEL}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-xs text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--ink)]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={FIELD}
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                At least 8 characters. Length beats symbols.
              </p>
            </div>

            {error && (
              <p className="text-sm text-[var(--ochre)]" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={isPending} className={PRIMARY}>
              {isPending ? "Creating…" : "Create account"}
            </button>
          </form>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="mt-4 w-full text-center text-[13px] text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--ink)]"
        >
          Sign up with email instead
        </button>
      )}

      <div className="mt-7 border-t border-[var(--border)] pt-5 text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link
          href={`/signin${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
          className="font-medium text-[var(--eucalypt)] underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
