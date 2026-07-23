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

// The camera clamp. Slightly looser than the fit so fitBounds has room to work
// (setting both identical makes the fit fight the clamp and shoves the camera
// into a corner), but tight enough that you can't pan far past the coast into
// the area the tileset doesn't cover — which renders as empty background and
// reads as a broken layout rather than as ocean.
const AUSTRALIA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [109, -46],
  [157, -7],
];

const SRC = "places";

// Where the camera was left last time.
//
// Refreshing back to the whole continent every time is a real annoyance: if you
// were looking at Seddon, you want Seddon again, not Australia. Stored in
// sessionStorage rather than localStorage so it lasts the browsing session but
// doesn't persist indefinitely — coming back tomorrow should start fresh.
//
// This is a VIEW preference, not a location: it records where you were looking,
// which is a different thing from where you were. Nothing derived from
// geolocation is ever written here.
const VIEW_KEY = "aib:map-view";

type SavedView = { lng: number; lat: number; zoom: number };

function loadView(): SavedView | null {
  try {
    const raw = sessionStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedView;
    if (
      typeof v.lng !== "number" ||
      typeof v.lat !== "number" ||
      typeof v.zoom !== "number"
    ) {
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

function saveView(v: SavedView) {
  try {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    // Storage can be unavailable (private mode, quota). Losing the saved view
    // is a minor inconvenience, not worth failing over.
  }
}

// Render a photo into a circular sprite MapLibre can use as a layer icon.
//
// MapLibre's image registry takes raw RGBA pixels, so the crop, the ring and
// the shadow are all drawn onto a canvas here rather than expressed in CSS.
// Doing it once per place at load is cheap; the result is cached by the map.
async function makeCircleIcon(
  src: string,
  size = 128,
): Promise<ImageData | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const r = size / 2;
    const ring = size * 0.07; // white border thickness

    // White disc behind everything — becomes the ring once the photo is drawn
    // inset within it.
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Clip to a circle, then draw the photo cover-style inside it.
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - ring, 0, Math.PI * 2);
    ctx.clip();

    // "cover": scale so the shorter side fills, centre-crop the rest.
    const inner = (r - ring) * 2;
    const scale = Math.max(inner / img.width, inner / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, r - w / 2, r - h / 2, w, h);
    ctx.restore();

    return ctx.getImageData(0, 0, size, size);
  } catch {
    // A photo that won't load shouldn't take the marker with it — the caller
    // falls back to a plain circle.
    return null;
  }
}

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
        //
        // Deliberately unhurried. The flight is doing work — it shows you where
        // you are RELATIVE to where you were looking, which a snap-cut destroys.
        // `essential: true` keeps it playing under prefers-reduced-motion, where
        // MapLibre would otherwise skip straight to the destination.
        map.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          duration: 2800,
          curve: 1.3,
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
    // Restore where you were looking, if this session has been here before.
    const saved = loadView();
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: "/map/style.json",
        ...(saved
          ? { center: [saved.lng, saved.lat] as [number, number], zoom: saved.zoom }
          : { bounds: AUSTRALIA_BOUNDS, fitBoundsOptions: { padding: 24 } }),
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

    // Remember where you were looking, so a refresh doesn't throw you back to
    // the whole continent. `moveend` covers pans, zooms and flights alike.
    map.on("moveend", () => {
      const c = map.getCenter();
      saveView({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
    });

    map.on("error", (e) => {
      const msg = e.error?.message ?? "Map resource failed to load";
      setFailed(msg);
      console.error("[map]", msg, e);
    });

    // Keep the canvas matched to its container.
    //
    // MapLibre measures once at construction. If the layout is still settling at
    // that moment — fonts loading, flex children resolving — the canvas ends up
    // smaller than its box and leaves a blank strip down one edge.
    //
    // The ResizeObserver handles later changes (window resize, rotation), but it
    // can fire on the same frame as construction and then never again, so the
    // initial mismatch persists. The explicit resizes below cover that: once on
    // the next frame, and again on `load` when fonts and style are settled.
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    requestAnimationFrame(() => map.resize());
    map.once("load", () => map.resize());

    // --- Places as a clustered GeoJSON source -----------------------------
    //
    // Clustering is MapLibre's own: correct, fast, and it handles the zoom
    // transitions properly. Far better than grouping by hand.
    const addPlacesLayer = async () => {
      if (map.getSource(SRC)) return;

      // Load each place's photo into the map's image registry as a circular
      // sprite. Done before the layer is added so icons are available on first
      // paint rather than popping in. Places whose photo fails keep an `icon`
      // of undefined and fall through to the plain-circle layer below.
      const withIcons = new Set<string>();
      await Promise.all(
        places.map(async (p) => {
          if (!p.face) return;
          const data = await makeCircleIcon(p.face);
          if (!data) return;
          const iconId = `place-${p.id}`;
          if (!map.hasImage(iconId)) {
            map.addImage(iconId, data, { pixelRatio: 2 });
          }
          withIcons.add(p.id);
        }),
      );

      map.addSource(SRC, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: places.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            properties: {
              id: p.id,
              slug: p.slug,
              name: p.name,
              icon: withIcons.has(p.id) ? `place-${p.id}` : "",
            },
          })),
        },
        cluster: true,
        clusterRadius: 55,
        clusterMaxZoom: 13,
        // Carry ONE member's icon up to the cluster, so a group of places still
        // shows a photograph rather than a blank circle with a number on it.
        //
        // Which member wins is arbitrary — the aggregation keeps whichever it
        // reduces to last, not a "best" one. That's an acceptable trade: a
        // photo of one of the places here is far more informative than no photo
        // at all, and the count makes clear there are others.
        clusterProperties: {
          icon: [
            ["case", ["!=", ["accumulated"], ""], ["accumulated"], ["get", "icon"]],
            ["get", "icon"],
          ],
        },
      });

      // Clusters WITHOUT a photo to show — a plain circle with the count.
      map.addLayer({
        id: "place-clusters",
        type: "circle",
        source: SRC,
        filter: ["all", ["has", "point_count"], ["==", ["get", "icon"], ""]],
        paint: {
          "circle-color": "#4a5d43",
          "circle-radius": ["step", ["get", "point_count"], 18, 5, 24, 15, 30],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Clusters WITH a photo — one member's image, so a group still shows a
      // place rather than an abstract count.
      map.addLayer({
        id: "place-cluster-photos",
        type: "symbol",
        source: SRC,
        filter: ["all", ["has", "point_count"], ["!=", ["get", "icon"], ""]],
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.26,
            10,
            0.42,
            14,
            0.6,
          ],
          "icon-anchor": "center",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": 1,
        },
      });

      // The count, centred on the cluster.
      //
      // Centred rather than badged in a corner: with no offset there's nothing
      // to drift as the icon scales with zoom, and a number in the middle reads
      // immediately as "this many places" without competing for the corner.
      map.addLayer({
        id: "place-cluster-count",
        type: "symbol",
        source: SRC,
        filter: ["all", ["has", "point_count"], ["!=", ["get", "icon"], ""]],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Medium"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 14, 15],
          "text-anchor": "center",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          // Dark green with a white outline: legible over any photo without a
          // filled badge competing with the image behind it.
          "text-color": "#2d3a27",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      // Counts for photoless clusters sit in the middle of the plain circle.
      map.addLayer({
        id: "place-cluster-count-plain",
        type: "symbol",
        source: SRC,
        filter: ["all", ["has", "point_count"], ["==", ["get", "icon"], ""]],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Medium"],
          "text-size": 12,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      // Individual places WITHOUT a usable photo — a plain circle.
      map.addLayer({
        id: "place-points",
        type: "circle",
        source: SRC,
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "icon"], ""]],
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

      // Individual places WITH a photo — the circular sprite.
      //
      // The place is the hero, so once you're close enough to tell places
      // apart, the map should show what they look like rather than where a dot
      // is. Icons scale with zoom: small enough not to crowd at city level,
      // large enough to actually read up close.
      map.addLayer({
        id: "place-photos",
        type: "symbol",
        source: SRC,
        filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "icon"], ""]],
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.22,
            10,
            0.36,
            14,
            0.55,
            18,
            0.7,
          ],
          // The circle's centre IS the coordinate — stated explicitly rather
          // than relying on the default, so the marker can't drift off the
          // place it represents.
          "icon-anchor": "center",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
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
          // Sit below the icon. Scales with zoom in step with icon-size, since
          // text-offset is in ems and a fixed value drifts as the icon grows.
          "text-offset": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12,
            ["literal", [0, 1.6]],
            18,
            ["literal", [0, 2.6]],
          ],
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
      const expandCluster = (
        e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
      ) => {
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
      };
      map.on("click", "place-clusters", expandCluster);
      map.on("click", "place-cluster-photos", expandCluster);

      // Tapping a place opens its preview — both the photo and plain layers.
      const openPlace = (
        e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
      ) => {
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
      };
      map.on("click", "place-points", openPlace);
      map.on("click", "place-photos", openPlace);

      for (const layer of [
        "place-clusters",
        "place-cluster-photos",
        "place-points",
        "place-photos",
      ]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    };

    if (map.isStyleLoaded()) void addPlacesLayer();
    else map.once("load", () => void addPlacesLayer());

    return () => {
      resizeObserver.disconnect();
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
