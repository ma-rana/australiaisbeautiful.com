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

        // flyTo rather than easeTo: this can be a continental jump, and a flat
        // pan across Australia is disorienting. The arc-out-and-back gives you a
        // sense of where you've come from.
        map.flyTo({
          center: [longitude, latitude],
          zoom: 15.5,
          duration: 1800,
          curve: 1.5,
          essential: true,
        });

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
  // Markers change CHARACTER with zoom:
  //   far out  — small coloured dots. A photo would be unreadable at that size,
  //              and a small dot marks a point more precisely than a large one.
  //   close in — the place's photo in a ringed circle. The place is the hero;
  //              let it show itself.
  //
  // CLUSTERING: markers that would overlap on screen merge into one, showing the
  // topmost photo with a count badge. Without this, two places a few hundred
  // metres apart collide into an unreadable mess — visible with just two places,
  // and unusable with twenty. Clustering is done in SCREEN space (pixels between
  // projected positions) rather than geographic distance, because overlap is a
  // rendering problem: what matters is whether they collide at the current zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let markers: maplibregl.Marker[] = [];

    // Below this, plain coloured dots. Above it, photo markers.
    const PHOTO_ZOOM = 11;
    // Screen distance under which two markers are considered colliding.
    const CLUSTER_PX = 64;

    type Cluster = { members: MapPlace[]; lat: number; lng: number };

    const buildClusters = (): Cluster[] => {
      const z = map.getZoom();
      const clusters: Cluster[] = [];

      // Greedy grouping: walk the places, drop each into the first cluster whose
      // centre is within CLUSTER_PX on screen, or start a new one. Good enough
      // at this scale and stable enough not to flicker between frames.
      for (const p of places) {
        const pt = map.project([p.longitude, p.latitude]);
        let placed = false;

        for (const c of clusters) {
          const cpt = map.project([c.lng, c.lat]);
          const dx = pt.x - cpt.x;
          const dy = pt.y - cpt.y;
          if (Math.hypot(dx, dy) < CLUSTER_PX) {
            c.members.push(p);
            // Recentre on the members' mean so the cluster sits among them.
            c.lat =
              c.members.reduce((s, m) => s + m.latitude, 0) / c.members.length;
            c.lng =
              c.members.reduce((s, m) => s + m.longitude, 0) / c.members.length;
            placed = true;
            break;
          }
        }

        if (!placed) {
          clusters.push({ members: [p], lat: p.latitude, lng: p.longitude });
        }
      }

      return clusters;
    };

    const sizeFor = (z: number, isCluster: boolean) => {
      if (z >= PHOTO_ZOOM) {
        const base = Math.round(
          36 + Math.min(Math.max(z - PHOTO_ZOOM, 0) / 7, 1) * 24,
        );
        return isCluster ? base + 6 : base;
      }
      const t = Math.min(Math.max((z - 3) / (PHOTO_ZOOM - 3), 0), 1);
      const base = Math.round(9 + t * 7);
      return isCluster ? base + 6 : base;
    };

    const render = () => {
      markers.forEach((m) => m.remove());
      markers = [];

      const z = map.getZoom();
      const asPhoto = z >= PHOTO_ZOOM;
      const clusters = buildClusters();

      for (const c of clusters) {
        const isCluster = c.members.length > 1;
        const lead = c.members[0];
        const size = sizeFor(z, isCluster);

        const el = document.createElement("button");
        el.className = "aib-pin";
        el.dataset.mode = asPhoto ? "photo" : "dot";
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.setAttribute(
          "aria-label",
          isCluster ? `${c.members.length} places here` : lead.name,
        );

        if (lead.face) {
          const img = document.createElement("img");
          img.src = lead.face;
          img.alt = "";
          img.className = "aib-pin-photo";
          el.appendChild(img);
        }

        if (isCluster) {
          const badge = document.createElement("span");
          badge.className = "aib-pin-count";
          badge.textContent = String(c.members.length);
          // Font size is set here rather than in CSS: a percentage font-size
          // resolves against the parent's FONT size, not its dimensions, so it
          // can't scale with the marker from a stylesheet. Derived from the
          // marker's actual pixel size so the badge stays proportional.
          badge.style.fontSize = `${Math.max(9, Math.round(size * 0.26))}px`;
          el.appendChild(badge);
        }

        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (isCluster) {
            // Zoom in to break the cluster apart rather than showing a list —
            // the map already knows where they are, so let it show you.
            map.easeTo({
              center: [c.lng, c.lat],
              zoom: Math.min(z + 2.5, 19),
              duration: 600,
            });
          } else {
            setSelected(lead);
            map.easeTo({
              center: [lead.longitude, lead.latitude],
              duration: 500,
            });
          }
        });

        markers.push(
          new maplibregl.Marker({
            element: el,
            anchor: "center",
            rotationAlignment: "viewport",
            pitchAlignment: "viewport",
          })
            .setLngLat([c.lng, c.lat])
            .addTo(map),
        );
      }
    };

    if (map.loaded()) render();
    else map.once("load", render);

    // Re-cluster as the view changes — overlap depends on zoom and position.
    map.on("moveend", render);
    map.on("zoomend", render);

    return () => {
      map.off("moveend", render);
      map.off("zoomend", render);
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
          <div className="aib-sheet overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--paper)] shadow-lg">
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
          <div className="aib-sheet overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--paper)] shadow-lg">
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
