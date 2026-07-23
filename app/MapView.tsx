"use client";

// app/MapView.tsx — the public map. Australia, and only Australia.
//
// MapLibre + Protomaps (D17): one .pmtiles file served as a static asset, read
// directly by the browser with range requests. No tile server, no per-load
// billing, ever. "Australia only" is literal here — the camera is clamped to the
// continent's bounds, not just visually cropped.
//
// Street mode only. No satellite (no free imagery at usable resolution, and it
// reintroduces metering), no 3D, no terrain.
//
// The map is the home surface: places as pins, tap one to open it.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
// MapLibre v5's ESM build has NO default export — everything is named. A
// namespace import keeps the familiar `maplibregl.Map` style while matching
// what the package actually ships.
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

// Register the pmtiles:// protocol ONCE, at module scope.
//
// This must not live in an effect: the protocol is global to the maplibre
// module, so an effect that registers on mount and removes on unmount tears it
// out from under a map that's still running — which React does constantly in
// development (StrictMode double-mounts, Fast Refresh re-runs effects).
//
// VERSION NOTE: pmtiles 4.x expects MapLibre v5's protocol API. MapLibre v6
// changed it, and the failure is silent — registration succeeds, the archive
// reads fine on its own, but MapLibre never requests a single tile and the style
// never finishes loading. Keep maplibre-gl pinned to ^5 unless pmtiles has
// confirmed v6 support.
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

export type MapPlace = {
  id: string;
  slug: string;
  name: string;
  place: string;
  latitude: number;
  longitude: number;
  face: string | null;
};

// Australia's bounds — the same values as MAP_MAX_BOUNDS in .env.
const AUSTRALIA_BOUNDS: [[number, number], [number, number]] = [
  [112, -44],
  [154, -9],
];

export function MapView({ places }: { places: MapPlace[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensurePmtilesProtocol();

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: "/map/style.json",
        bounds: AUSTRALIA_BOUNDS,
        fitBoundsOptions: { padding: 40 },
        maxBounds: AUSTRALIA_BOUNDS, // the clamp — you cannot leave Australia
        minZoom: 3,
        maxZoom: 15,
        attributionControl: false,
      });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Map failed to start");
      return;
    }

    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      }),
      "bottom-right",
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("error", (e) => {
      // Surface style/tile failures rather than leaving a blank grey box.
      const msg = e.error?.message ?? "Map resource failed to load";
      setFailed(msg);
      console.error("[map]", msg, e);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      // NOTE: the pmtiles protocol is deliberately NOT removed here. It's global
      // and shared; removing it on unmount breaks any map that mounts after
      // (and, in development, the one remounting right now).
    };
  }, []);

  // Add markers once the map is ready, and whenever places change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers: maplibregl.Marker[] = [];

    const add = () => {
      for (const p of places) {
        const el = document.createElement("button");
        el.className = "aib-pin";
        el.setAttribute("aria-label", p.name);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected(p);
          map.easeTo({ center: [p.longitude, p.latitude], duration: 500 });
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([p.longitude, p.latitude])
          .addTo(map);
        markers.push(marker);
      }
    };

    if (map.loaded()) add();
    else map.once("load", add);

    return () => markers.forEach((m) => m.remove());
  }, [places]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Honest failure state — a blank grey box tells you nothing. */}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--paper)] p-8">
          <div className="max-w-sm text-center">
            <p
              className="text-lg text-[var(--ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              The map didn&apos;t load
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">{failed}</p>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Check that <code>/map/australia.pmtiles</code> and{" "}
              <code>/map/style.json</code> exist.
            </p>
          </div>
        </div>
      )}

      {/* Bottom sheet — tapping a pin previews the place without leaving the map. */}
      {selected && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:left-4 sm:right-auto sm:w-80 sm:p-4">
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--paper)] shadow-lg">
            {selected.face && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.face}
                alt=""
                className="h-32 w-full object-cover"
              />
            )}
            <div className="p-4">
              <p className="specimen-label">{selected.place}</p>
              <h2
                className="mt-1 text-xl text-[var(--ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {selected.name}
              </h2>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => router.push(`/location/${selected.slug}`)}
                  className="rounded-md bg-[var(--ink)] px-3 py-2 text-sm text-[var(--paper)]"
                >
                  Open this place
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
