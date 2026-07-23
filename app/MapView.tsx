"use client";

// app/MapView.tsx — the public map. Australia, and only Australia.
//
// MapLibre + Protomaps (D17): one .pmtiles file served as a static asset, read
// directly by the browser with range requests. No tile server, no per-load
// billing, ever. "Australia only" is literal — the camera is clamped to the
// continent, not just visually cropped.
//
// PLACES ARE A GEOJSON LAYER, not DOM markers.
//
// DOM markers were tried first, for photo-in-a-circle pins. They repeatedly
// failed to position — MapLibre never applied a transform, leaving every marker
// stacked at the container's origin regardless of lifecycle guards. A GeoJSON
// source sidesteps the entire problem: MapLibre positions features itself as
// part of rendering, so there is no projection step to get wrong, and
// clustering comes built in and correct rather than hand-rolled.
//
// The cost is that features are styled circles rather than photographs. Photos
// still carry the product — they're on the bottom sheet when you tap a place,
// on the location page, and throughout /places. The map's job is to show you
// WHERE things are; the photo's job starts once you've picked one.

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
// reads fine on its own, but MapLibre never requests a tile and the style never
// finishes loading. Keep maplibre-gl pinned to ^5 unless pmtiles confirms v6.
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

// The initial view: the whole continent.
const AUSTRALIA_BOUNDS: [[number, number], [number, number]] = [
  [112, -44],
  [154, -9],
];

// The camera clamp is deliberately LOOSER than the initial fit. Setting both to
// the same rectangle makes fitBounds fight maxBounds: the fit needs padding
// outside the rectangle to show all of it, the clamp refuses, and the camera
// ends up shoved into a corner of the continent.
const AUSTRALIA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [104, -50],
  [162, -4],
];

const SRC = "places";

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
        const { latitude, longitude, accuracy: acc } = pos.coords;

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

        // ACCURACY: browser geolocation without GPS (most desktops) works by
        // WiFi lookup and is typically 20-50m out — a house or two. The reported
        // figure is shown rather than hidden, so the dot doesn't imply a
        // precision it doesn't have. On a phone with GPS it tightens by itself.
        meMarkerRef.current?.remove();
        const el = document.createElement("div");
        el.className = "aib-me";
        el.setAttribute("aria-label", "Your approximate position");
        el.title = `Accurate to about ${Math.round(acc)}m`;
        meMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([longitude, latitude])
          .addTo(map);

        setAccuracy(acc);

        // flyTo rather than easeTo: this can be a continental jump, and a flat
        // pan across Australia is disorienting.
        map.flyTo({
          center: [longitude, latitude],
          zoom: 15,
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
        fitBoundsOptions: { padding: 24 },
        maxBounds: AUSTRALIA_MAX_BOUNDS,
        minZoom: 3,
        // The tileset stops at z13, but MapLibre overzooms vector tiles cleanly.
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
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("error", (e) => {
      const msg = e.error?.message ?? "Map resource failed to load";
      setFailed(msg);
      console.error("[map]", msg, e);
    });

    // --- Places as a clustered GeoJSON source -----------------------------
    //
    // Clustering is MapLibre's own: correct, fast, and it handles the zoom
    // transitions properly. Far better than grouping by hand.
    const addPlacesLayer = () => {
      if (map.getSource(SRC)) return;

      map.addSource(SRC, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: places.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            properties: { id: p.id, slug: p.slug, name: p.name },
          })),
        },
        cluster: true,
        clusterRadius: 55,
        clusterMaxZoom: 13,
      });

      // Cluster circles. Size steps with count so a big group reads as bigger.
      map.addLayer({
        id: "place-clusters",
        type: "circle",
        source: SRC,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#4a5d43",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            5,
            21,
            15,
            27,
          ],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });

      map.addLayer({
        id: "place-cluster-count",
        type: "symbol",
        source: SRC,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Medium"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });

      // Individual places.
      map.addLayer({
        id: "place-points",
        type: "circle",
        source: SRC,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#4a5d43",
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            5,
            10,
            8,
            16,
            12,
          ],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Names, once you're close enough for them to be useful.
      map.addLayer({
        id: "place-labels",
        type: "symbol",
        source: SRC,
        filter: ["!", ["has", "point_count"]],
        minzoom: 12,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Medium"],
          "text-size": 12,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
          "text-max-width": 9,
        },
        paint: {
          "text-color": "#2d3a27",
          "text-halo-color": "#faf9f6",
          "text-halo-width": 1.8,
        },
      });

      // Tapping a cluster zooms in until it splits.
      map.on("click", "place-clusters", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id;
        const src = map.getSource(SRC) as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({
            center: (feature.geometry as GeoJSON.Point).coordinates as [
              number,
              number,
            ],
            zoom,
            duration: 600,
          });
        });
      });

      // Tapping a place opens its preview.
      map.on("click", "place-points", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const id = feature.properties?.id as string;
        const found = places.find((p) => p.id === id);
        if (found) {
          setSelected(found);
          map.easeTo({
            center: [found.longitude, found.latitude],
            duration: 500,
          });
        }
      });

      for (const layer of ["place-clusters", "place-points"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    };

    if (map.isStyleLoaded()) addPlacesLayer();
    else map.once("load", addPlacesLayer);

    return () => {
      map.remove();
      mapRef.current = null;
      // NOTE: the pmtiles protocol is deliberately NOT removed here. It's global
      // and shared; removing it on unmount breaks any map mounting after.
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

      {/* Place preview — the photo lives here, where there's room for it. */}
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
