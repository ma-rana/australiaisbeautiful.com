// components/LegalPage.tsx — the shared frame for the policy pages (privacy,
// terms). A quiet reading surface with the wordmark as the way back to the map,
// matching the field-guide look of the rest of the site.
//
// These pages are deliberately plain: no map, no chrome competing with the
// text. They're read once, rarely, and what matters is that they're legible and
// honest. The prose lives in the page files; this only supplies the frame.

import Link from "next/link";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full overflow-y-auto bg-[var(--paper)]">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6 sm:py-16">
        {/* The wordmark is the way back to the map — the same mark and the same
            eucalypt place-dot the rest of the site uses. */}
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-[var(--eucalypt)] ring-2 ring-[var(--eucalypt)]/20 transition-transform group-hover:scale-110"
          />
          <span className="text-sm transition-opacity group-hover:opacity-70">
            Australia Is Beautiful
          </span>
        </Link>

        <h1
          className="mt-8 text-4xl leading-tight tracking-tight text-[var(--ink)] sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>
        <p className="specimen-label mt-3">Last updated {updated}</p>

        {/* The prose. `legal-prose` (globals.css) sets the reading rhythm —
            paragraph spacing, heading weight, list indents — so the page files
            stay plain semantic HTML. */}
        <div className="legal-prose mt-8">{children}</div>

        <div className="mt-14 border-t border-[var(--border)] pt-6">
          <Link
            href="/"
            className="text-sm text-[var(--eucalypt)] transition-opacity hover:opacity-70"
          >
            ← Back to the map
          </Link>
        </div>
      </div>
    </div>
  );
}
