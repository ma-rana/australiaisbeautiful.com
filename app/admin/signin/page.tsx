// app/admin/signin/page.tsx — the SEPARATE admin sign-in.
//
// Distinct from the public /signin. This is the staff door: same credential
// check, but it only lets MODERATOR+ through, and it lives on the admin surface
// (in prod, the admin subdomain). A normal explorer who signs in here is told
// this isn't an admin account — their credentials work on the public site, not
// here.
//
// SECURITY (later hardening, SECURITY.md §13d): this is where staff 2FA will be
// REQUIRED as a first-step gate. For now it's the structural separation; the 2FA
// requirement layers on before production. The real security value arrives with
// 2FA — this page is the place it will attach.

"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // Sign in with the shared credentials provider…
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Those credentials didn't match.");
        return;
      }
      // …then verify this account is actually staff. A normal explorer's login
      // succeeds as a credential, but they are NOT allowed into the admin area.
      // We check via a small endpoint that returns the session role.
      const meRes = await fetch("/api/admin/whoami");
      const me = (await meRes.json()) as { role?: string };
      const staff = me.role === "MODERATOR" || me.role === "ADMIN" || me.role === "CURATOR";
      if (!staff) {
        setError("This isn't an admin account. Use the main site to sign in.");
        return;
      }
      router.push("/admin/moments");
      router.refresh();
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-2 text-xs uppercase tracking-widest text-neutral-500">
        Staff access
      </div>
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        Admin sign in
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Restricted. Moderators and administrators only.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
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
            className="mt-1 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Signing in…" : "Sign in to admin"}
        </button>
      </form>

      {/* SECURITY NOTE for later: staff 2FA required here (SECURITY.md §13d). */}
    </main>
  );
}
