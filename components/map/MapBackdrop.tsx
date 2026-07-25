"use client";

// components/map/MapBackdrop.tsx — the map as a page background, without a map.
//
// V1 of this mounted a second LIVE MapLibre instance behind a scrim. Replaced
// deliberately: booting a WebGL renderer and streaming tiles to show 12% of a
// map through paper is cost without payoff — at that opacity the percept is
// "texture", and a JPEG produces the identical percept at ~1% of the cost.
//
// So: the homepage map takes a PARTING SNAPSHOT of its own canvas (see
// MapView's capture note) into sessionStorage, and this component just shows
// that image under the scrim. Same "the corner of Australia you were just
// browsing" continuity, zero extra WebGL, instant paint. When no snapshot
// exists (fresh tab, deep link, storage denied), the contour field stands in —
// the site's map-world-without-a-map texture, shared with AuthShell.
//
// variant="contours" skips the snapshot on purpose: /request already has a
// live map ON the page (the picker), and a photograph of a map behind a real
// map is visual double-vision. One map per page.
//
// Read in an effect, not during render: the server knows nothing about
// sessionStorage, and a hydration mismatch is the price of pretending it does.

import { useEffect, useState } from "react";
import { ContourField } from "@/components/ContourField";

const SNAP_KEY = "aib:map-snap:v1";

export function MapBackdrop({
  variant = "auto",
}: {
  variant?: "auto" | "contours";
}) {
  const [snap, setSnap] = useState<string | null>(null);

  useEffect(() => {
    if (variant === "contours") return;
    try {
      setSnap(sessionStorage.getItem(SNAP_KEY));
    } catch {
      // Storage unavailable — contours it is.
    }
  }, [variant]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      {snap ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snap}
            alt=""
            className="h-full w-full object-cover"
          />
          {/* The scrim guarantees the page's contrast regardless of what the
              snapshot contains. Tune this value, never the image. */}
          <div className="absolute inset-0 bg-[var(--paper)]/[0.88]" />
          {/* The snapshot renders OSM data, so it's attributed, even faintly —
              the licence has no "but it's decorative" clause. */}
          <p className="absolute bottom-1.5 right-2 text-[10px] text-[var(--muted)]/60">
            © OpenStreetMap
          </p>
        </>
      ) : (
        <ContourField />
      )}
    </div>
  );
}
