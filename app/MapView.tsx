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

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { placesNear, type NearbyPlace } from "./nearby-actions";

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
  const meMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // "Near me" state. The position is held in memory for this interaction only —
  // never sent anywhere but the one nearby query, never stored (D8).
  const [locating, setLocating] = useState(false);
  const [nearby, setNearby] = useState<NearbyPlace[] | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const findNearMe = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!("geolocation" in navigator)) {
      setLocateError("This browser can't share a location.");
      return;
    }

    setLocating(true);
    setLocateError(null);
    setSelected(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;

        // Outside Australia there's nothing to show — say so plainly rather
        // than flying the camera to a clamped edge and looking broken.
        const [[w, s], [e, n]] = AUSTRALIA_BOUNDS;
        if (longitude < w || longitude > e || latitude < s || latitude > n) {
          setLocating(false);
          setLocateError(
            "You're outside Australia — this map only covers Australian places.",
          );
          return;
        }

        // Drop a marker where you are, visually distinct from place pins.
        //
        // ACCURACY: browser geolocation without GPS (i.e. most desktops) works
        // by WiFi lookup and is typically 20-50m out — a house or two. Rather
        // than draw a confident dot and imply precision we don't have, the ring
        // is sized to the reported accuracy. On a phone with GPS it tightens to
        // a few metres on its own.
        meMarkerRef.current?.remove();
        const el = document.createElement("div");
        el.className = "aib-me";
        el.setAttribute("aria-label", "Your approximate position");
        el.title = `Accurate to about ${Math.round(accuracy)}m`;
        meMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([longitude, latitude])
          .addTo(map);

        setAccuracy(accuracy);

        map.easeTo({ center: [longitude, latitude], zoom: 17, duration: 900 });

        const res = await placesNear(latitude, longitude, 50);
        setLocating(false);
        if (res.ok) {
          setNearby(res.places);
          if (res.places.length === 0) {
            setLocateError("No places on the map within 50km of you yet.");
          }
        } else {
          setLocateError(res.error);
        }
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was declined. You can still explore the map."
            : "Couldn't work out where you are.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

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
        // The tileset stops at z13, but MapLibre overzooms vector tiles cleanly —
        // geometry scales without pixelating, so z19 still renders sharply from
        // z13 data. No NEW detail appears past z13 (buildings aren't in the
        // tiles), but the extra zoom matters for placing yourself precisely
        // against the streets that are there.
        maxZoom: 19,
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
  //
  // Markers change CHARACTER with zoom, deliberately:
  //   far out  — small dots. Photo markers would overlap into mush at
  //              continental zoom, and at that distance you're scanning for
  //              clusters, not identifying individual places.
  //   close in — the place's photo. Once places are distinguishable, showing
  //              what they look like is far more inviting than a coloured dot,
  //              and it's the thesis of the whole product: the place is the hero.
  //
  // Size also scales continuously with zoom so markers feel anchored to the
  // ground rather than floating above it at a fixed pixel size.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers: maplibregl.Marker[] = [];
    const elements: HTMLElement[] = [];

    // Below this, plain coloured dots. Above it, photo markers.
    //
    // Set at 11 (roughly "a city in view"): far enough out that photos would be
    // too small to read anyway, so a crisp coloured dot marks position more
    // precisely than a blurry thumbnail. Photos earn their place only once
    // you're close enough for them to actually show you something.
    const PHOTO_ZOOM = 11;

    const applyZoomStyling = () => {
      const z = map.getZoom();
      const asPhoto = z >= PHOTO_ZOOM;

      for (const el of elements) {
        if (asPhoto) {
          // Square: 36px at the threshold, growing to 60px zoomed right in.
          const size = Math.round(
            36 + Math.min(Math.max(z - PHOTO_ZOOM, 0) / 7, 1) * 24,
          );
          el.dataset.mode = "photo";
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
        } else {
          // Small and precise: 9px right out, 16px approaching the threshold.
          // A small dot marks a point more honestly than a big one.
          const t = Math.min(Math.max((z - 3) / (PHOTO_ZOOM - 3), 0), 1);
          const size = Math.round(9 + t * 7);
          el.dataset.mode = "dot";
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
        }
      }
    };

    const add = () => {
      for (const p of places) {
        const el = document.createElement("button");
        el.className = "aib-pin";
        el.dataset.mode = "dot";
        el.setAttribute("aria-label", p.name);

        // A circular photo marker.
        //
        // Deliberately a circle, not a teardrop. A pin's point claims an exact
        // address; these are parks, beaches and reserves — areas, not addresses.
        // A circle is honest about that, and it can't drift out of alignment the
        // way a composed pin shape does.
        if (p.face) {
          const img = document.createElement("img");
          img.src = p.face;
          img.alt = "";
          img.className = "aib-pin-photo";
          el.appendChild(img);
        }

        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected(p);
          map.easeTo({ center: [p.longitude, p.latitude], duration: 500 });
        });

        const marker = new maplibregl.Marker({
          element: el,
          // A circle marks an area, so its centre is the point.
          anchor: "center",
          // Stay upright and flat-on regardless of map rotation or pitch.
          rotationAlignment: "viewport",
          pitchAlignment: "viewport",
        })
          .setLngLat([p.longitude, p.latitude])
          .addTo(map);
        markers.push(marker);
        elements.push(el);
      }
      applyZoomStyling();
    };

    if (map.loaded()) add();
    else map.once("load", add);

    map.on("zoom", applyZoomStyling);

    return () => {
      map.off("zoom", applyZoomStyling);
      markers.forEach((m) => m.remove());
    };
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

      {/* Near me — a one-off position read, never stored. */}
      <div className="absolute bottom-4 right-3 z-10 sm:bottom-6 sm:right-4">
        <button
          onClick={findNearMe}
          disabled={locating}
          className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--paper)]/95 px-4 py-2.5 text-sm shadow-md backdrop-blur transition-colors hover:border-[var(--eucalypt)] disabled:opacity-60"
        >
          <span aria-hidden>◉</span>
          {locating ? "Finding you…" : "Near me"}
        </button>
      </div>

      {/* What the location turned up — or why it didn't. */}
      {(nearby?.length || locateError) && !selected && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:left-4 sm:right-auto sm:w-80 sm:p-4">
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--paper)] shadow-lg">
            <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-3">
              <p className="specimen-label">
                {nearby?.length ? `${nearby.length} nearby` : "Near me"}
                {accuracy !== null && (
                  <span className="ml-2 normal-case tracking-normal opacity-70">
                    ±{Math.round(accuracy)}m
                  </span>
                )}
              </p>
              <button
                onClick={() => {
                  setNearby(null);
                  setLocateError(null);
                  setAccuracy(null);
                }}
                className="text-sm text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Close
              </button>
            </div>

            {locateError && (
              <p className="px-4 py-3 text-sm text-[var(--muted)]">
                {locateError}
              </p>
            )}

            {nearby && nearby.length > 0 && (
              <ul className="max-h-64 divide-y divide-[var(--border)] overflow-y-auto">
                {nearby.map((p) => (
                  <li key={p.slug}>
                    <button
                      onClick={() => router.push(`/location/${p.slug}`)}
                      className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--paper-2)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[var(--ink)]">
                          {p.name}
                        </span>
                        <span className="specimen-label">{p.place}</span>
                      </span>
                      <span className="shrink-0 text-sm text-[var(--muted)]">
                        {p.metres < 1000
                          ? `${Math.round(p.metres)} m`
                          : `${(p.metres / 1000).toFixed(1)} km`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
