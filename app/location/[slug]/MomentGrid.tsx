"use client";

// app/location/[slug]/MomentGrid.tsx — the moment grid + full-screen viewer.
//
// The field note is the product: in the viewer, the caption is set in the display
// serif and given room, treated as the reason to read, not a mere label. The grid
// is quiet and even; the boldness is spent on the reading experience, not chrome.

import { useState, useEffect, useCallback } from "react";

export type ViewerMedia = { id: string; src: string };
export type ViewerMoment = {
  id: string;
  caption: string | null;
  createdAt: string;
  media: ViewerMedia[];
};

export function MomentGrid({ moments }: { moments: ViewerMoment[] }) {
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
  const prev = useCallback(() => setPhotoIndex((p) => Math.max(p - 1, 0)), []);

  useEffect(() => {
    if (current === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while the viewer is open.
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [current, close, next, prev]);

  if (moments.length === 0) {
    // Empty state as invitation, not absence (design writing guidance).
    return (
      <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center">
        <p
          className="text-xl text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          No moments yet
        </p>
        <p className="mt-2 text-[var(--muted)]">
          This place is waiting for its first photo and field note.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* The grid — even, quiet tiles. One per moment. */}
      <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {moments.map((m, i) => (
          <li key={m.id}>
            <button
              onClick={() => openMoment(i)}
              className="group relative block aspect-[4/5] w-full overflow-hidden rounded-md bg-[var(--paper-2)] ring-1 ring-[var(--border)] transition duration-300 hover:ring-[var(--eucalypt)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.media[0]?.src}
                alt={m.caption ?? "A moment at this place"}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              {m.media.length > 1 && (
                <span className="absolute right-2 top-2 rounded-full bg-[var(--ink)]/70 px-2 py-0.5 text-[0.68rem] font-medium tracking-wide text-white backdrop-blur-sm">
                  1 / {m.media.length}
                </span>
              )}
              {/* A faint field-note affordance when there's a caption */}
              {m.caption && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--ink)]/70 to-transparent px-3 pb-2.5 pt-8 text-left text-xs leading-snug text-white/90 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <span className="line-clamp-2">{m.caption}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* Full-screen viewer */}
      {current && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[var(--paper)] dark:bg-[var(--paper)]"
          role="dialog"
          aria-modal="true"
        >
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
            <span className="specimen-label">
              {current.media.length > 1
                ? `Frame ${photoIndex + 1} of ${current.media.length}`
                : "One frame"}
            </span>
            <button
              onClick={close}
              className="specimen-label rounded-full px-3 py-1 transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
              aria-label="Close viewer"
            >
              Close ✕
            </button>
          </div>

          {/* Photo stage */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--paper-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.media[photoIndex]?.src}
              alt={current.caption ?? "A moment at this place"}
              className="max-h-full max-w-full object-contain"
            />

            {current.media.length > 1 && (
              <>
                {photoIndex > 0 && (
                  <button
                    onClick={prev}
                    className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--paper)]/80 text-2xl text-[var(--ink)] shadow-sm ring-1 ring-[var(--border)] backdrop-blur transition hover:bg-[var(--paper)]"
                    aria-label="Previous frame"
                  >
                    ‹
                  </button>
                )}
                {photoIndex < current.media.length - 1 && (
                  <button
                    onClick={next}
                    className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--paper)]/80 text-2xl text-[var(--ink)] shadow-sm ring-1 ring-[var(--border)] backdrop-blur transition hover:bg-[var(--paper)]"
                    aria-label="Next frame"
                  >
                    ›
                  </button>
                )}
              </>
            )}
          </div>

          {/* The field note — the product. Set in the display serif, given room. */}
          <div className="border-t border-[var(--border)] px-6 py-6">
            <div className="mx-auto max-w-2xl">
              {current.caption && (
                <p
                  className="text-lg leading-relaxed text-[var(--ink)] sm:text-xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {current.caption}
                </p>
              )}
              <p className="specimen-label mt-3">
                Shared by an Explorer
                {"   ·   "}
                {new Date(current.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>

              {/* Frame dots */}
              {current.media.length > 1 && (
                <div className="mt-4 flex gap-1.5">
                  {current.media.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIndex(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === photoIndex
                          ? "w-6 bg-[var(--eucalypt)]"
                          : "w-1.5 bg-[var(--border)]"
                      }`}
                      aria-label={`Go to frame ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
