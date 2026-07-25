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

function ContourBackground() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.5]"
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="var(--border)"
      strokeWidth="1.1"
    >
      {/* A "peak" in the upper left — nested closed contours. */}
      <path d="M-60 130 C 40 40, 200 30, 260 110 C 320 190, 260 290, 150 300 C 40 310, -110 220, -60 130 Z" />
      <path d="M-40 145 C 45 70, 175 60, 225 125 C 275 190, 230 262, 140 271 C 50 280, -80 215, -40 145 Z" />
      <path d="M-15 160 C 50 100, 150 92, 190 140 C 230 188, 198 236, 128 243 C 58 250, -50 213, -15 160 Z" />
      <path d="M12 172 C 58 130, 128 124, 156 156 C 184 188, 162 216, 114 221 C 66 226, -14 210, 12 172 Z" />

      {/* A second, larger system lower right — open contours running off-canvas,
          the way real map sheets crop them. */}
      <path d="M820 470 C 700 430, 560 460, 520 560 C 480 660, 560 760, 700 790 C 780 806, 830 800, 900 780" />
      <path d="M830 510 C 730 480, 610 505, 578 585 C 546 665, 610 738, 720 762 C 780 774, 830 770, 890 755" />
      <path d="M840 550 C 760 528, 660 548, 634 608 C 608 668, 656 720, 740 738 C 790 748, 840 744, 885 733" />
      <path d="M850 588 C 790 572, 712 588, 692 630 C 672 672, 706 706, 766 718 C 806 726, 848 722, 880 714" />

      {/* Sparse mid-field lines — a valley between the two. */}
      <path d="M-40 520 C 120 470, 300 500, 420 440 C 520 390, 560 300, 640 260" />
      <path d="M-40 580 C 130 535, 310 560, 430 505 C 530 458, 590 372, 680 330" />

      {/* One index contour in eucalypt, faint — the accent every fifth line
          gets on a real topo sheet. */}
      <path
        d="M-30 655 C 150 605, 330 630, 450 575 C 550 528, 620 445, 720 405"
        stroke="var(--eucalypt)"
        strokeOpacity="0.35"
      />
    </svg>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--paper)] px-6">
      <ContourBackground />

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
