// components/icons.tsx — the site's shared icon set.
//
// ONE family, so every icon across the non-map pages reads as the same hand:
// the same 24px grid, the same 2.1 stroke, the same round caps and joins as the
// map controls (MapControls.tsx). Before this, pages used typographic glyphs as
// stand-in icons — ★/☆ for ratings, ‹/› for the viewer arrows, ✕ for close, ›
// for the disclosure chevron. Glyphs inherit the FONT's weight and metrics, not
// the design's, so they read thin and slightly off next to real UI — exactly
// the "flimsy" look these replace.
//
// Inline SVG rather than an icon package (CLAUDE.md — no dependency without
// asking), and they inherit `currentColor` so a parent's text colour drives
// them. Size defaults to 20 (the map-control size); pass `size` to override.
// `strokeWidth` defaults to the shared 2.1 but a few glyphs that read heavy at
// that weight (the star) tune it down locally.
//
// USAGE: <Icon.Star filled /> , <Icon.ChevronRight />, <Icon.Close />, etc.

import type { SVGProps } from "react";

const STROKE = 2.1;

type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & {
  size?: number;
  strokeWidth?: number;
};

// The shared frame: viewBox, colour inheritance, round caps. Every icon body
// is just its paths; this wraps them identically so they can't drift.
function base(
  { size = 20, strokeWidth = STROKE, ...rest }: IconProps,
  children: React.ReactNode,
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ arrows */

// Back — a line-arrow, not the typographic ←. Used by BackToMap and the
// "Back to {place}" links, so the way-back affordance is one drawn shape
// everywhere instead of a font glyph that changes with the typeface.
export const ArrowLeft = (p: IconProps) =>
  base(p, <><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>);

// Viewer navigation. Chevrons (not full arrows) for "there's more this way" —
// a heading-arrow would over-claim, same reasoning as the map's reticle.
export const ChevronLeft = (p: IconProps) => base(p, <path d="M15 19l-7-7 7-7" />);
export const ChevronRight = (p: IconProps) => base(p, <path d="M9 19l7-7-7-7" />);

/* ------------------------------------------------------------------ actions */

// Close. A drawn ✕ with round caps, matched weight — the ✕ character rendered
// at the font's own weight next to 2.1-stroke UI was the clearest mismatch.
export const Close = (p: IconProps) =>
  base(p, <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>);

// Disclosure chevron for the "Removed (N)" <details>. Points right when shut,
// the caller rotates it down on open (group-open:rotate-90), same as now.
export const Disclosure = (p: IconProps) => base(p, <path d="M9 6l6 6-6 6" />);

/* -------------------------------------------------------------- rating star */

// Directions — the navigate-to-here handoff. The classic navigation arrow
// (compass needle), drawn in the family's stroke. Points up-right: outward,
// "go there", the complement of ArrowLeft's "come back".
export const Directions = (p: IconProps) =>
  base(p, <path d="M20.5 3.5L11 20.4l-1.8-7.1-7.1-1.8z" />);

// Share — the box-with-arrow (the iOS share glyph, the most widely understood
// share mark). The arrow leaves the box: the link goes OUT — which is exactly
// the product's growth model (§7i: the URL is the share).
export const Share = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M12 3v12" />
      <path d="M8 6.5L12 3l4 3.5" />
      <path d="M6.5 10.5H5.8A1.8 1.8 0 004 12.3v6.4a1.8 1.8 0 001.8 1.8h12.4a1.8 1.8 0 001.8-1.8v-6.4a1.8 1.8 0 00-1.8-1.8h-.7" />
    </>,
  );

// Camera — the contribute affordance ("Add your photos"). Drawn in the family's
// stroke so the CTA's icon matches the map controls and the star, not an emoji
// or a font glyph. Body + top notch + lens; no flash detail — quiet, like the
// rest of the set.
export const Camera = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M4 8.5A1.8 1.8 0 015.8 6.7h2.1l1.3-1.9h5.6l1.3 1.9h2.1A1.8 1.8 0 0120 8.5v8A1.8 1.8 0 0118.2 18.3H5.8A1.8 1.8 0 014 16.5z" />
      <circle cx="12" cy="12.3" r="3.1" />
    </>,
  );

// The star carries meaning, so it's the one icon that fills. Outline when
// unearned, solid when earned — the fill is the state, drawn (not the ★/☆
// glyph pair, which are two different characters at two different weights).
// Tuned to 1.8 stroke: a star at 2.1 reads chunky because of its many joins.
export const Star = ({ filled = false, ...p }: IconProps & { filled?: boolean }) =>
  base(
    { strokeWidth: 1.8, ...p },
    <path
      d="M12 3.2l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 16.8 6.5 20l1.3-6.1L3.2 9.6l6.2-.7z"
      fill={filled ? "currentColor" : "none"}
    />,
  );

// "Good spot" acknowledgement in the viewer. A location pin with a tick — it
// points at the PLACE (never a person), and the tick says "this helped".
// Deliberately NOT a heart or thumb: those are person-directed like-language,
// which this product refuses (D21 — the count never sorts, it just says "this
// helped someone").
export const GoodSpot = ({ filled = false, ...p }: IconProps & { filled?: boolean }) =>
  base(
    p,
    <>
      <path
        d="M12 21c-4.5-4.2-6.8-7.4-6.8-10.4a6.8 6.8 0 0113.6 0c0 3-2.3 6.2-6.8 10.4z"
        fill={filled ? "currentColor" : "none"}
      />
      <path
        d="M9.3 10.4l1.9 1.9 3.5-3.7"
        stroke={filled ? "var(--paper)" : "currentColor"}
      />
    </>,
  );

// A namespace export too, so call sites can read <Icon.Close /> when that's
// clearer than a bare import.
export const Icon = {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Close,
  Directions,
  Disclosure,
  Share,
  Star,
  GoodSpot,
};
