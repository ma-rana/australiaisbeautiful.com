// app/signup/page.tsx — create an explorer account.
//
// The shortest honest form that can exist: email, password, one button.
// No name, no handle, no avatar — signup collects nothing that could become
// a public identity, because there are no public identities here (D23).
// The copy says plainly what an account is FOR (contributing) and what it
// isn't (a profile), because "no profiles" is a selling point worth stating
// at the exact moment someone hands over an email address.
//
// No confirm-password field, on purpose: it doubles the typing, catches
// almost nothing a "show password" toggle wouldn't, and signup friction is
// this product's scarcest-resource problem. The browser's password manager
// is the real safety net.
//
// On success the client signs in through the NORMAL credentials flow —
// the action only creates the row, so there's one session code path.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, FIELD, LABEL, PRIMARY } from "@/components/AuthShell";
import { createAccount } from "./actions";

export default function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <AuthShell>
      <p className="specimen-label text-[var(--ochre)]">New explorer</p>
      <h1
        className="mt-3 text-3xl tracking-tight text-[var(--ink)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Create an account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        An account here is for contributing — photos, field notes, ratings.
        There&apos;s no profile and no followers; your contributions belong to
        the places, not to a page about you.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
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

        {error && <p className="text-sm text-[var(--ochre)]">{error}</p>}

        <button type="submit" disabled={isPending} className={PRIMARY}>
          {isPending ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link
          href={`/signin${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
          className="text-[var(--eucalypt)] underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
