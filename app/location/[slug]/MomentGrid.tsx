"use client";

// app/location/[slug]/MomentGrid.tsx — the moment grid + full-screen viewer.
//
// A client component because the viewer is interactive (open, swipe, close).
// The location page (a server component) fetches the moments and passes them in.
//
// Behaviour (UX_PATTERNS §1, §5, §6):
// - A multi-photo moment shows as ONE tile (first photo + a "1/N" cue).
// - Tapping a tile opens a full-screen viewer over the page.
// - Swipe/arrow through the set; caption shown; close returns to the grid.
// - Signed-out users see everything; the react/contribute wall comes later.

import { useState, useEffect, useCallback } from "react";

export type ViewerMedia = {
  id: string;
  src: string; // resolved public path (dev) or signed URL (later)
};

export type ViewerMoment = {
  id: string;
  caption: string | null;
  createdAt: string; // ISO — "shared on", a freshness signal
  media: ViewerMedia[];
};

export function MomentGrid({ moments }: { moments: ViewerMoment[] }) {
  // Which moment is open in the viewer (null = grid only), and which photo.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const openMoment = (i: number) => {
    setOpenIndex(i);
    setPhotoIndex(0);
  };
  const close = useCallback(() => setOpenIndex(null), []);

  const current = openIndex !== null ? moments[openIndex] : null;

  const next = useCallback(() => {
    if (!current) return;
    setPhotoIndex((p) => Math.min(p + 1, current.media.length - 1));
  }, [current]);

  const prev = useCallback(() => {
    setPhotoIndex((p) => Math.max(p - 1, 0));
  }, []);

  // Keyboard: arrows to move, Escape to close.
  useEffect(() => {
    if (current === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, close, next, prev]);

  if (moments.length === 0) {
    return (
      <p className="mt-2 text-neutral-500">
        No photos yet — this place is waiting for its first moment.
      </p>
    );
  }

  return (
    <>
      {/* The grid — one tile per moment. */}
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {moments.map((m, i) => (
          <li key={m.id}>
            <button
              onClick={() => openMoment(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.media[0]?.src}
                alt={m.caption ?? "A moment at this place"}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              {/* "1/N" cue for multi-photo sets */}
              {m.media.length > 1 && (
                <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                  1/{m.media.length}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* The full-screen viewer */}
      {current && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          role="dialog"
          aria-modal="true"
        >
          {/* Top bar: close + position */}
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm text-white/70">
              {current.media.length > 1
                ? `${photoIndex + 1} / ${current.media.length}`
                : ""}
            </span>
            <button
              onClick={close}
              className="rounded-full px-3 py-1 text-sm hover:bg-white/10"
              aria-label="Close"
            >
              Close ✕
            </button>
          </div>

          {/* The photo */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.media[photoIndex]?.src}
              alt={current.caption ?? "A moment at this place"}
              className="max-h-full max-w-full object-contain"
            />

            {/* Prev / next controls (multi-photo only) */}
            {current.media.length > 1 && (
              <>
                {photoIndex > 0 && (
                  <button
                    onClick={prev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-white hover:bg-white/20"
                    aria-label="Previous photo"
                  >
                    ‹
                  </button>
                )}
                {photoIndex < current.media.length - 1 && (
                  <button
                    onClick={next}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-white hover:bg-white/20"
                    aria-label="Next photo"
                  >
                    ›
                  </button>
                )}
              </>
            )}
          </div>

          {/* Caption — the field note, the actual product. Attribution is
              always "an Explorer" (equality, D23); date is a freshness signal. */}
          <div className="px-6 py-5 text-white">
            {current.caption && (
              <p className="mx-auto max-w-2xl leading-relaxed">
                {current.caption}
              </p>
            )}
            <p className="mx-auto mt-2 max-w-2xl text-sm text-white/50">
              Shared by an Explorer ·{" "}
              {new Date(current.createdAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Dots for the set */}
          {current.media.length > 1 && (
            <div className="flex justify-center gap-1.5 pb-5">
              {current.media.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === photoIndex ? "bg-white" : "bg-white/30"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
