"use client";

// components/AuthShell.tsx — the shared frame for the account thresholds
// (/signin, /signup).
//
// One frame, two pages, so the thresholds can't drift apart: the quiet
// "back to the map" line top-left, a narrow centred column, and the
// contour background behind everything.
//
// THE BACKGROUND. The instinct it serves: the threshold should feel connected
// to the map, not like account machinery from another product. The obvious
// implementation — the live map at low opacity — was rejected on purpose:
// MapLibre would boot WebGL and fetch the pmtiles archive purely as
// decoration, tiles vary so text contrast is unpredictable, and a moving,
// interactive-looking surface behind a form reads as a broken layer rather
// than a backdrop.
//
// Instead: TOPOGRAPHIC CONTOUR LINES, drawn once as inline SVG in the site's
// own hairline colour. Elevation contours are the most map-coded mark that
// exists, they're static, they cost nothing, they inherit dark mode through
// the CSS variable, and at this opacity they sit far behind the form's
// contrast requirements. It's the same trade the map itself makes elsewhere:
// suggest the territory, never compete with the content.

import Link from "next/link";
import { ContourField } from "./ContourField";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--paper)] px-6">
      <ContourField />

      <div className="relative pt-6">
        <Link
          href="/"
          className="specimen-label transition-colors hover:text-[var(--ink)]"
        >
          ← Back to the map
        </Link>
      </div>

      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pb-24">
        {children}
      </div>
    </main>
  );
}

// The shared form vocabulary, exported so both thresholds use one set.
export const FIELD =
  "mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--paper)] " +
  "px-3.5 py-2.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--muted)]/70 " +
  "transition-colors focus:border-[var(--eucalypt)] focus:outline-none " +
  "focus:ring-2 focus:ring-[var(--eucalypt)]/20";

export const LABEL = "block text-sm text-[var(--ink)]/85";

export const PRIMARY =
  "w-full rounded-md bg-[var(--eucalypt)] px-4 py-2.5 text-sm font-medium " +
  "text-[var(--paper)] transition-opacity hover:opacity-90 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--eucalypt)]/40 " +
  "disabled:opacity-50";
