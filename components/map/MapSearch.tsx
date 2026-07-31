"use client";

// components/map/MapSearch.tsx — the map home's search pill (UX §7b, the
// "map-home layout" subsection).
//
// The spec, distilled:
//   - The map is the whole canvas; search is ONE minimal element floating on
//     it. A BAR, not a bare icon — "on a NEW platform the visible bar teaches;
//     the icon assumes."
//   - Compact pill by default (calm) → tap → smooth quick expand (~200-300ms)
//     to a focused surface, the map dimming gently behind ("focus here now") →
//     results as you type → clear / tap-away collapses back to the calm pill.
//   - "Restraint is what makes it feel considered, not gimmicky." No bounce, no
//     theatrical unfold. Motion moves TOWARD the next action (the results).
//
// WHERE IT SEARCHES: the client already holds every approved place (the same
// `places` array the map layer is built from), so search is a local filter —
// instant, no network, no new endpoint. When the catalogue grows past what's
// sane to ship to the client, this becomes a server action behind the same UI;
// the component's shape doesn't change. For Phase 2/early-3 volumes, local is
// correct and the fastest possible.
//
// ON SELECT: the same path a pin-tap uses — fly the camera to the place and
// open it. We don't reimplement the preview sheet here; we hand the chosen
// place back to MapView via onSelect and let its existing selection flow run.
//
// PLACEMENT: top-centre. §7b wants search floating on the map; the wordmark is
// top-left and the account affordance top-right (MapNav), so centre is the one
// clear band. On mobile it's a near-full-width pill under the nav; on desktop a
// centred fixed-width pill. Either way it never collides with MapNav's corners.

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPlace } from "./MapView";
import { MAP_SURFACE } from "./chrome";
import { specimenLine } from "@/lib/category";

// Ranking: exact name > name-prefix > name-substring > locality > category,
// with a multi-word AND fallback so "byron nsw" matches a place whose name and
// state each contain one word. Verified against a fixture before shipping.
function scorePlace(query: string, p: MapPlace): number {
  const q = query.trim().toLowerCase();
  if (!q) return -1;
  const name = p.name.toLowerCase();
  const place = (p.place || "").toLowerCase();
  const kind = (p.kind || "").toLowerCase();
  const hay = `${name} ${place} ${kind}`;

  if (!name.includes(q) && !place.includes(q) && !kind.includes(q)) {
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((t) => hay.includes(t))) return 40;
    return -1;
  }
  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (name.includes(q)) return 70;
  if (place.includes(q)) return 55;
  return 45; // kind
}

const MAX_RESULTS = 8;

// A search glass, drawn to match the stroke weight of MapNav's account icon so
// the chrome reads as one set.
function SearchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function MapSearch({
  places,
  onSelect,
}: {
  places: MapPlace[];
  onSelect: (place: MapPlace) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0); // keyboard-highlighted result
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return places
      .map((p) => ({ p, s: scorePlace(query, p) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s || a.p.name.length - b.p.name.length)
      .slice(0, MAX_RESULTS)
      .map((r) => r.p);
  }, [query, places]);

  // Focus the field the instant it expands, so typing starts immediately.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the highlighted row valid as results change.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Collapse on outside click and on Escape — the same discipline as MapNav's
  // menu. Tapping away is the spec's "clear / tap-away collapses it back".
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        collapse();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function collapse() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function choose(place: MapPlace) {
    onSelect(place);
    collapse();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      // First Escape with text clears it; a second (empty) collapses — matches
      // how every search field behaves and avoids losing the field on a stray
      // key while mid-query.
      if (query) setQuery("");
      else collapse();
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    }
  }

  return (
    <div
      ref={wrapRef}
      // Placement, and why it differs by breakpoint:
      //   Mobile — MapNav's wordmark (left) and account pill (right) fill the
      //     top row, so a centred pill there would collide with both. The pill
      //     drops to a SECOND row, below the 44px nav (top-16), full-width.
      //   Desktop — the corners are far apart with open space between, so the
      //     pill sits on the top row, centred, as §7b's floating element.
      // pointer-events-none on the positioner so the map stays draggable in the
      // gaps beside the pill; the pill itself re-enables them.
      className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-3 sm:top-0 sm:pt-4"
    >
      {/* The dim behind the expanded surface — "focus here now". A gentle scrim
          over the whole map, click-through to collapse. Only while open, and it
          fades rather than snaps. Kept subtle (§7b: "a subtle map dim", not a
          modal blackout).

          It's a FIXED full-viewport layer. Rather than a negative z-index
          inside this positioner (fragile — a fixed child with z-[-1] can fall
          behind the map depending on stacking context), it's rendered first so
          the pill's own DOM order puts it on top, and both carry explicit
          z-indices in the same context. */}
      {open && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={collapse}
          className="pointer-events-auto fixed inset-0 z-20 cursor-default bg-black/10 opacity-0 backdrop-blur-[1px] animate-[aib-dim_200ms_ease-out_forwards]"
        />
      )}

      <div
        className={`pointer-events-auto relative z-30 w-full transition-[max-width] duration-200 ease-out ${
          open ? "max-w-xl" : "max-w-[22rem]"
        }`}
      >
        {!open ? (
          // The calm pill. A visible label, not a lone icon — it teaches.
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${MAP_SURFACE} flex h-11 w-full items-center gap-2.5 rounded-full px-4 text-left text-[var(--muted)] transition-colors hover:text-[var(--ink)]`}
          >
            <SearchGlyph className="shrink-0" />
            <span className="text-sm">Search places</span>
          </button>
        ) : (
          // The focused surface. Same glass, taller affordance, the field plus
          // a live result list beneath. rounded-2xl (not full) because it now
          // holds a column, not a single line.
          <div className={`${MAP_SURFACE} overflow-hidden rounded-2xl`}>
            <div className="flex h-12 items-center gap-2.5 px-4">
              <SearchGlyph className="shrink-0 text-[var(--muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search places"
                aria-label="Search places"
                className="h-full flex-1 bg-transparent text-[0.95rem] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
              />
              <button
                type="button"
                onClick={collapse}
                aria-label="Close search"
                className="shrink-0 text-sm text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
              >
                ✕
              </button>
            </div>

            {query.trim() && (
              <div className="border-t border-[color-mix(in_srgb,var(--eucalypt)_16%,transparent)]">
                {results.length === 0 ? (
                  // Empty result → the spec's own move: the empty result becomes
                  // the prompt to suggest the place (§7c). One honest tap, and it
                  // routes to the request flow rather than a dead end.
                  <div className="px-4 py-4">
                    <p className="text-sm text-[var(--muted)]">
                      Nothing on the map for “{query.trim()}”.
                    </p>
                    <a
                      href="/request"
                      className="mt-1.5 inline-block text-sm text-[var(--eucalypt)] transition-opacity hover:opacity-70"
                    >
                      Suggest this place →
                    </a>
                  </div>
                ) : (
                  <ul className="max-h-[min(60dvh,22rem)] overflow-y-auto py-1">
                    {results.map((p, i) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setActive(i)}
                          onClick={() => choose(p)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            i === active
                              ? "bg-[color-mix(in_srgb,var(--eucalypt)_12%,transparent)]"
                              : "hover:bg-[color-mix(in_srgb,var(--eucalypt)_8%,transparent)]"
                          }`}
                        >
                          {p.face ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.face}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--paper-2)] text-base text-[var(--eucalypt)]"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {p.name.charAt(0)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span
                              className="block truncate text-[0.98rem] leading-snug text-[var(--ink)]"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {p.name}
                            </span>
                            <span className="specimen-label mt-0.5 block truncate">
                              {specimenLine(p.kind, p.place)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
