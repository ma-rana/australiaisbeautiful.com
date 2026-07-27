"use client";

// app/help/HelpForm.tsx — the public help & feedback form.
//
// One-way: the person tells us something (a bug, a question, a content problem)
// and we act on it. There's no reply thread here — if we need to follow up and
// they left an email, we do it out of band (D23: no in-app person-to-person
// messaging). The copy says so plainly, so nobody waits on a reply that isn't
// coming through the app.
//
// Field-guide aesthetic, same frame as the other public thresholds.

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ContourField } from "@/components/ContourField";
import { FIELD, LABEL, PRIMARY } from "@/components/AuthShell";
import { sendSupportMessage } from "./actions";

const CATEGORIES = [
  { value: "BUG", label: "Something's broken", blurb: "A glitch or error" },
  { value: "HELP", label: "I need help", blurb: "A question about the site" },
  {
    value: "CONTENT_REPORT",
    label: "Report content",
    blurb: "Something here is wrong or inappropriate",
  },
] as const;

export function HelpForm({ defaultEmail }: { defaultEmail: string }) {
  const pathname = usePathname();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>(
    "BUG",
  );
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await sendSupportMessage({
        category,
        body,
        email: email.trim() || undefined,
        // Referrer path is the most useful debugging context — but this page IS
        // /help, so send the page they came from when we have it, else /help.
        path:
          typeof document !== "undefined" && document.referrer
            ? new URL(document.referrer).pathname
            : pathname,
      });
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  };

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--paper)] px-6">
      <ContourField />

      <div className="relative z-10 flex items-center justify-between pt-6">
        <Link
          href="/"
          className="specimen-label transition-colors hover:text-[var(--ink)]"
        >
          Australia Is Beautiful
        </Link>
        <Link
          href="/"
          className="specimen-label transition-colors hover:text-[var(--ink)]"
        >
          ← The map
        </Link>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-16">
        <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--paper)_60%,var(--paper-2))] px-7 py-9 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(0,0,0,0.25)] sm:px-9 sm:py-10">
          {sent ? (
            <div className="text-center">
              <p className="specimen-label text-[var(--eucalypt)]">Sent</p>
              <h1
                className="mt-3 text-[1.75rem] leading-[1.15] tracking-tight text-[var(--ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Thank you — we&apos;ve got it
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">
                The team reads every message. We don&apos;t reply inside the
                app, but if you left an email and it needs a response, we&apos;ll
                be in touch there.
              </p>
              <Link href="/" className={`${PRIMARY} mt-7`}>
                Back to the map
              </Link>
            </div>
          ) : (
            <>
              <p className="specimen-label text-[var(--ochre)]">
                Help &amp; feedback
              </p>
              <h1
                className="mt-3 text-[1.75rem] leading-[1.15] tracking-tight text-[var(--ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Tell us what&apos;s up
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">
                Found a bug, stuck on something, or spotted content that
                shouldn&apos;t be here? Let us know. This goes straight to the
                team — we read every one.
              </p>

              <form onSubmit={submit} className="mt-7 space-y-5">
                {/* Category — segmented, three clear buckets. */}
                <div>
                  <span className={LABEL}>What kind of message is this?</span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {CATEGORIES.map((c) => {
                      const on = category === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setCategory(c.value)}
                          className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                            on
                              ? "border-[var(--eucalypt)] bg-[var(--eucalypt)]/[0.06]"
                              : "border-[var(--border)] hover:border-[var(--eucalypt)]/40"
                          }`}
                        >
                          <span className="block text-[13px] font-medium text-[var(--ink)]">
                            {c.label}
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--muted)]">
                            {c.blurb}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="body" className={LABEL}>
                    Your message
                  </label>
                  <textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                    rows={5}
                    autoFocus
                    placeholder={
                      category === "BUG"
                        ? "What happened, and what did you expect instead? Which page were you on?"
                        : category === "HELP"
                          ? "What are you trying to do?"
                          : "What did you see, and where?"
                    }
                    className={`${FIELD} resize-y leading-relaxed`}
                  />
                </div>

                <div>
                  <label htmlFor="email" className={LABEL}>
                    Email{" "}
                    <span className="font-normal text-[var(--muted)]">
                      (optional — only if you&apos;d like a reply)
                    </span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={FIELD}
                  />
                </div>

                {error && (
                  <p className="text-sm text-[var(--ochre)]" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isPending || body.trim().length < 10}
                  className={PRIMARY}
                >
                  {isPending ? "Sending…" : "Send message"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="specimen-label mt-6 text-center text-[0.62rem] text-[var(--muted)]/70">
          {/* "no account needed" only reassures a SIGNED-OUT visitor — telling
              someone who's logged in they don't need an account is noise. */}
          We read every message · one-way{defaultEmail ? "" : " · no account needed"}
        </p>
      </div>
    </main>
  );
}
