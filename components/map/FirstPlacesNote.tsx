"use client";

// components/map/FirstPlacesNote.tsx — the empty map's one-line explanation.
//
// Shown only while the map has NO approved places: a bare map with zero pins
// reads as broken, and this line is the difference between "broken" and
// "early". But it's a NOTE, not chrome — it says its piece and leaves:
//
//   - top-centre, under the nav, where nothing else lives at any width. The
//     old bottom placement had to dodge the control column with asymmetric
//     padding (px-4 pr-16), and centring inside a lopsided box put the pill
//     visibly off-centre on phones. Up here it centres truly.
//   - auto-fades after a few seconds, and a tap dismisses it immediately.
//   - dismissal is remembered for the SESSION (sessionStorage), so navigating
//     back to the map doesn't replay it — but a genuinely fresh visit still
//     gets told why the map is empty.
//
// The fade uses a transition rather than the .aib-sheet keyframe so the
// global prefers-reduced-motion rule neutralises it for free.

import { useEffect, useRef, useState } from "react";

const KEY = "aib:first-places-note:v1";
const SHOW_FOR_MS = 8000;
const FADE_MS = 400;

export function FirstPlacesNote() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      // Storage unavailable (private mode quirks) — still show once; it just
      // won't remember, which is the acceptable failure.
    }
    setMounted(true);
    // Next frame so the enter transition actually plays.
    const raf = requestAnimationFrame(() => setVisible(true));
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        timers.current.push(setTimeout(() => setMounted(false), FADE_MS));
        try {
          sessionStorage.setItem(KEY, "1");
        } catch {}
      }, SHOW_FOR_MS),
    );
    const held = timers.current;
    return () => {
      cancelAnimationFrame(raf);
      held.forEach(clearTimeout);
    };
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    setVisible(false);
    timers.current.push(setTimeout(() => setMounted(false), FADE_MS));
  };

  if (!mounted) return null;

  return (
    // Under MapNav (p-3 + 44px chrome = 56px), truly centred — symmetric
    // padding, nothing to dodge in this band at any viewport width.
    <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4 sm:top-[4.5rem]">
      <button
        type="button"
        onClick={dismiss}
        aria-label="The first places are being added. Dismiss."
        className={`pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--paper)]/95 py-2.5 pl-5 pr-4 text-sm text-[var(--muted)] shadow-sm backdrop-blur transition-[opacity,transform] duration-[400ms] hover:text-[var(--ink)] ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"
        }`}
      >
        <span className="truncate">The first places are being added.</span>
        {/* The quiet ✕ — makes "tap to dismiss" visible without a second
            control. The whole pill is the target; this is just the hint. */}
        <span aria-hidden className="text-[var(--muted)]/60">
          ✕
        </span>
      </button>
    </div>
  );
}
