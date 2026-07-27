"use client";

// components/AuthShell.tsx — the shared frame for the account thresholds
// (/signin, /signup).
//
// One frame, two pages, so the thresholds can't drift apart. The design reads
// as the FRONTISPIECE OF A FIELD GUIDE: a naturalist's specimen card set on
// warm paper over the site's topographic contour sheet. The account form is
// the specimen; everything around it is the tag and the plate.
//
// THE BACKGROUND. The instinct it serves: the threshold should feel connected
// to the map, not like account machinery from another product. The obvious
// implementation — the live map at low opacity — was rejected on purpose:
// MapLibre would boot WebGL and fetch the pmtiles archive purely as
// decoration. Instead, the ContourField (shared with the map's own fallback):
// static elevation contours, the site's "map-world without a map" texture.
//
// THE CARD. New in this pass: the form sits on a real paper card with a hairline
// border and a soft lift, rather than floating naked on the background. A card
// is what a specimen is mounted on — it gives the threshold a physical object to
// be, and separates the form's contrast needs from the busy contour field
// behind it. The card carries a corner "plate" detail (a coordinate tag) as the
// signature element: map-coded, quiet, and unmistakably this product.

import Link from "next/link";
import { ContourField } from "./ContourField";

export function AuthShell({
  children,
  plate,
}: {
  children: React.ReactNode;
  // The corner coordinate tag — differs per page (a real Australian landmark's
  // coordinates), so /signin and /signup carry a small sense of place without
  // repeating. Optional: falls back to a neutral marker.
  plate?: string;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--paper)] px-6">
      <ContourField />

      {/* Masthead — the guide's spine label, top-left, always. */}
      <div className="relative z-10 flex items-center justify-between pt-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5"
          aria-label="Australia Is Beautiful — back to the map"
        >
          <PlaceMark />
          <span className="specimen-label transition-colors group-hover:text-[var(--ink)]">
            Australia Is Beautiful
          </span>
        </Link>
        <Link
          href="/"
          className="specimen-label transition-colors hover:text-[var(--ink)]"
        >
          ← The map
        </Link>
      </div>

      {/* The specimen card, centred. */}
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
        <div className="relative rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--paper)_60%,var(--paper-2))] px-7 py-9 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(0,0,0,0.25)] sm:px-9 sm:py-10">
          {/* Corner plate — the signature detail. A naturalist's coordinate tag
              in the top-right, letterspaced like the specimen labels. */}
          {plate && (
            <span
              aria-hidden
              className="specimen-label absolute right-6 top-6 hidden text-[0.6rem] text-[var(--muted)]/70 sm:block"
            >
              {plate}
            </span>
          )}
          {children}
        </div>

        {/* Plate footer — a hairline and a quiet field-guide line, so the card
            sits on the page like a mounted plate rather than a lone box. */}
        <p className="specimen-label mt-6 text-center text-[0.62rem] text-[var(--muted)]/70">
          A place-first guide to Australia
        </p>
      </div>
    </main>
  );
}

// A small eucalypt place-mark — the same circle-not-pin idea the map uses (a
// place is an area, not an address), shrunk to a masthead glyph.
function PlaceMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <circle
        cx="9"
        cy="9"
        r="5.5"
        fill="var(--eucalypt)"
        fillOpacity="0.18"
        stroke="var(--eucalypt)"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="9" r="1.6" fill="var(--eucalypt)" />
    </svg>
  );
}

// The shared form vocabulary, exported so both thresholds use one set.
export const FIELD =
  "mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--paper)] " +
  "px-3.5 py-2.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--muted)]/60 " +
  "transition-colors focus:border-[var(--eucalypt)] focus:outline-none " +
  "focus:ring-2 focus:ring-[var(--eucalypt)]/20";

export const LABEL = "block text-[13px] font-medium text-[var(--ink)]/85";

// The shared PRIMARY button delegates to the .btn system in globals.css
// (defined once, used everywhere). `w-full` stays because auth/contribute
// forms want a full-width action.
export const PRIMARY = "btn btn-primary w-full";
