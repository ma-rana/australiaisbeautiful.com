"use client";

// components/map/MapControls.tsx — the map's controls.
//
// Three groups, separated by what each one DOES, not by what fits:
//
//   ◈  Suggest a place   — leaves the map (goes to /request)
//   ⌖  Near me           — moves the camera to you
//   ±  Zoom              — moves the camera in place
//
// Near me and zoom both move the camera, so an earlier version grouped them.
// That was wrong: near me is an intent ("take me somewhere") and zoom is an
// adjustment ("a bit closer"). Grouping them made an intentional action feel
// like a nudge, and it put a 44px target you press once directly against two
// you press repeatedly. Separated, each group is one idea.
//
// Single actions are circles; zoom is a stacked pair, so it's a rounded block.
// The shape itself says how many things are in there before you read the icon.
//
// This replaces MapLibre's NavigationControl and the CSS that used to drag it
// into this corner. Zoom calls map.zoomIn()/zoomOut() directly.
//
// PLACEMENT: the suggest affordance belongs on the map at the moment of
// noticing (UX §7c) rather than buried in the header — but "available, not
// insistent". So it sits at the same visual weight as everything else, and
// turns ochre ONLY when near-me proves there's a real gap here.

import Link from "next/link";
import { MAP_SURFACE, MAP_BUTTON } from "./chrome";

// Mirrors the near-me lifecycle in MapView. "found" means a position was read
// and the camera flew to it; nothing about it is stored (D8).
export type LocateState = "idle" | "locating" | "found" | "denied";

export interface MapControlsProps {
  locateState: LocateState;
  onLocate: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /**
   * Highlight "Suggest a place". Set this when a near-me read found nothing
   * within NEARBY_RADIUS_M — the moment §7c calls out: "Nothing here yet —
   * suggest a place?", with the gap already established.
   */
  suggestInvited?: boolean;
  /**
   * A sheet is open. On mobile the nearby list and the place preview are
   * full-width at the bottom edge, so the stack steps aside rather than
   * floating over them. On desktop the sheet sits on the left and never
   * touches this corner, so nothing changes there.
   */
  sheetOpen?: boolean;
  /** Where the compass goes. Callers can pass coordinates to pre-place the pin. */
  suggestHref?: string;
}

/* ------------------------------------------------------------------ icons */

// Inline rather than an icon package: four icons doesn't justify a dependency
// (CLAUDE.md — never add one without asking), and these need to inherit the
// palette variables anyway.
//
// Drawn on a 24px grid at 1.6 stroke, which is the weight that stays crisp at
// the 18-19px they actually render at. Heavier reads clumsy against the map's
// fine linework; lighter disappears over a photograph.

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// A compass. Suggesting a place IS an exploration action (§7c: "suggesting a
// place is an exploration action") — a pencil framed it as editing a database,
// which is Waze's model, not this one. The compass says "go find something
// that isn't here yet".
//
// The needle is solid against the hollow ring, so at 18px it reads as a compass
// rather than as another circle. That matters because "Near me" directly below
// is also round — the reticle's ticks break its outline into a cross, this one
// stays a clean disc, and the filled needle is the tiebreaker.
function CompassIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="1.6" {...S} aria-hidden>
      <circle cx="12" cy="12" r="8.6" />
      <path
        d="M15.7 8.3l-2.2 5.2-5.2 2.2 2.2-5.2z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.9"
      />
    </svg>
  );
}

// A reticle, not a filled arrow: the arrow implies heading, which is a
// navigation idea, and this product deep-links directions out rather than
// routing (PLAN, "turn-by-turn navigation — deep-link out, permanently").
function ReticleIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="1.6" {...S} aria-hidden>
      <circle cx="12" cy="12" r="6.1" />
      {filled && <circle cx="12" cy="12" r="2.7" fill="currentColor" stroke="none" />}
      <path d="M12 2.4v3.1M12 18.5v3.1M2.4 12h3.1M18.5 12h3.1" />
    </svg>
  );
}

function ReticleOffIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="1.6" {...S} aria-hidden>
      <circle cx="12" cy="12" r="6.1" />
      <path d="M12 2.4v3.1M12 18.5v3.1M2.4 12h3.1M18.5 12h3.1" />
      <path d="M4.7 4.7l14.6 14.6" strokeWidth="1.7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...S} aria-hidden>
      <path d="M12 5.6v12.8M5.6 12h12.8" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...S} aria-hidden>
      <path d="M5.6 12h12.8" />
    </svg>
  );
}

/* -------------------------------------------------------------- primitives */

// Shared with MapNav so the top and bottom chrome can't drift apart — see
// chrome.ts for why the surface is two shadows rather than one, and why
// the button carries no text colour of its own.
const SURFACE = MAP_SURFACE;
const BTN = MAP_BUTTON;

// Left of the stack, not below: the stack hugs the right edge, so a tooltip
// underneath would run off screen. Desktop only — on touch there's no hover to
// reveal it, and the aria-label already carries the name for screen readers.
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="pointer-events-none absolute right-full top-1/2 mr-2.5 hidden -translate-y-1/2
                 whitespace-nowrap rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-xs
                 font-medium text-[var(--paper)] shadow-sm
                 md:group-hover:block md:group-focus-visible:block"
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ export */

export function MapControls({
  locateState,
  onLocate,
  onZoomIn,
  onZoomOut,
  suggestInvited = false,
  sheetOpen = false,
  suggestHref = "/request",
}: MapControlsProps) {
  const locateLabel =
    locateState === "denied"
      ? "Location is off — turn it on in your browser to see places near you"
      : locateState === "locating"
        ? "Finding you…"
        : "Near me";

  const locateTone =
    locateState === "found"
      ? "text-[var(--ochre)]"
      : locateState === "denied"
        ? "text-[var(--muted)]"
        : "text-[var(--ink)]";

  return (
    <div
      className={`absolute bottom-4 right-3 z-10 flex-col items-end gap-2.5 sm:bottom-6 sm:right-4 ${
        sheetOpen ? "hidden sm:flex" : "flex"
      }`}
    >
      {/* Suggest a place — a circle, because it's one action.
          Ink by default: findable, not shouting (§7c). Ochre only when
          near-me has proved there's nothing here to contribute to instead. */}
      <Link
        href={suggestHref}
        aria-label="Suggest a place"
        className={`${SURFACE} ${BTN} rounded-full ${
          suggestInvited
            ? "border-[var(--ochre)]/40 text-[var(--ochre)] hover:bg-[var(--ochre)]/10"
            : "text-[var(--ink)]"
        }`}
      >
        <CompassIcon />
        <Tip>
          {suggestInvited ? "Nothing here yet — suggest a place" : "Suggest a place"}
        </Tip>
      </Link>

      {/* Near me — its own circle. An intent, not an adjustment; it doesn't
          belong stuck to the zoom buttons. */}
      <button
        type="button"
        onClick={onLocate}
        disabled={locateState === "locating"}
        aria-label={locateLabel}
        aria-pressed={locateState === "found"}
        className={`${SURFACE} ${BTN} rounded-full ${locateTone}`}
      >
        {/* Spins while reading the position. The global reduced-motion rule in
            globals.css already neutralises this — no separate guard needed. */}
        <span className={locateState === "locating" ? "flex animate-spin" : "flex"}>
          {locateState === "denied" ? (
            <ReticleOffIcon />
          ) : (
            <ReticleIcon filled={locateState === "found"} />
          )}
        </span>
        <Tip>{locateLabel}</Tip>
      </button>

      {/* Zoom — the one pair, so the one block. Desktop only: pinch already
          covers it on a phone, and the bottom edge is expensive there. */}
      <div className={`${SURFACE} hidden overflow-hidden rounded-2xl md:block`}>
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          className={`${BTN} text-[var(--ink)]`}
        >
          <PlusIcon />
          <Tip>Zoom in</Tip>
        </button>
        {/* Inset hairline: a full-width rule would cut the block in two and make
            it read as two controls again, which is the thing being fixed. */}
        <div className="mx-2.5 h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          className={`${BTN} text-[var(--ink)]`}
        >
          <MinusIcon />
          <Tip>Zoom out</Tip>
        </button>
      </div>
    </div>
  );
}
