"use client";

// app/MapShell.tsx — the client boundary for the map.
//
// MapLibre touches `window` at import time, so it can never be evaluated on the
// server. `ssr: false` is only permitted inside a client component, and the home
// page is a server component (it queries the database) — hence this thin
// wrapper: it owns the dynamic import so the page doesn't have to.

import dynamic from "next/dynamic";
import type { MapPlace } from "./MapView";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--paper-2)]">
      <p className="specimen-label">Loading the map…</p>
    </div>
  ),
});

export function MapShell({ places }: { places: MapPlace[] }) {
  return <MapView places={places} />;
}
