"use client";

// components/map/MapView.tsx — the public map. Australia, and only Australia.
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
import { MapControls } from "./MapControls";
import { NEARBY_RADIUS_M, NEARBY_SEARCH_RADIUS_KM } from "@/lib/constants";
import {
  AUSTRALIA_BOUNDS,
  AUSTRALIA_MAX_BOUNDS,
  loadView,
  saveView,
} from "./camera";

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

// The initial view, the camera clamp, and the saved-view store live in
// ./camera — shared with the /request LocationPicker so both surfaces open
// where the person was last looking, and so "never persist a
// geolocation-derived camera" (D8) is documented in one place.

const SRC = "places";

// Sprite geometry, in device pixels. Registered at pixelRatio 2, so the
// rendered CSS size is half these numbers at icon-size 1.
//
// The canvas is deliberately LARGER than the disc it draws. A drop shadow
// painted at the canvas edge is simply clipped away, which is why the previous
// version had no shadow at all despite the comment claiming one — there was
// nowhere for it to go. ICON_PAD is that somewhere.
const ICON_CANVAS = 152;
const ICON_PAD = 11; // room for the shadow to fall into
const ICON_HAIRLINE = 2; // dark outer edge
const ICON_RING = 7; // white ring

// Render a photo into a circular sprite MapLibre can use as a layer icon.
//
// MapLibre's image registry takes raw RGBA pixels, so the crop, the rings and
// the shadow are all drawn onto a canvas here rather than expressed in CSS.
// Doing it once per place at load is cheap; the result is cached by the map.
//
// TWO rings, not one. The white ring alone disappears against pale terrain —
// the map's own background is #f2f0e9 and desert fill is paler still, so a
// white-ringed photo bleeds into the ground and stops reading as a marker. The
// dark hairline outside it is what holds the edge on sand; the white ring is
// what holds it against dark bush and water. Each covers the case the other
// fails. Google and Airbnb both land on the same two-ring answer.
async function makeCircleIcon(
  src: string,
  size = ICON_CANVAS,
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

    const c = size / 2;
    const outer = c - ICON_PAD;

    // Shadow + hairline in one pass: filling the outer disc with the shadow
    // enabled paints both, and the shadow is cleared immediately after so it
    // doesn't accumulate under every subsequent fill.
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.32)";
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(c, c, outer, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(26, 28, 26, 0.22)";
    ctx.fill();
    ctx.restore();

    // The white ring, inset by the hairline.
    ctx.beginPath();
    ctx.arc(c, c, outer - ICON_HAIRLINE, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Clip to a circle, then draw the photo cover-style inside it.
    const photoR = outer - ICON_HAIRLINE - ICON_RING;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, photoR, 0, Math.PI * 2);
    ctx.clip();

    // "cover": scale so the shorter side fills, centre-crop the rest.
    const inner = photoR * 2;
    const scale = Math.max(inner / img.width, inner / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, c - w / 2, c - h / 2, w, h);
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
  // D8 guard: the next moveend after a "near me" flight must NOT be persisted —
  // the flight lands the camera exactly on the user's position, and writing
  // that to durable storage would store a value derived from geolocation.
  // Single-shot: the flag clears on that moveend, so later manual pans (which
  // are view choices, not positions) save normally.
  const suppressSaveRef = useRef(false);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // "Near me" state. The position is held in memory for this interaction only —
  // never sent anywhere but the one nearby query, never stored (D8).
  const [locating, setLocating] = useState(false);
  const [nearby, setNearby] = useState<NearbyPlace[] | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  // Tracked separately from locateError so the control can show a struck-through
  // reticle for "you refused" without string-matching the error copy. A denied
  // permission is a different state from a failed read: one is recoverable by
  // tapping again, the other needs browser settings.
  const [denied, setDenied] = useState(false);

  const findNearMe = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!("geolocation" in navigator)) {
      setDenied(true);
      setLocateError("This browser can't share a location.");
      return;
    }

    setLocating(true);
    setLocateError(null);
    setDenied(false);
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
        suppressSaveRef.current = true; // don't persist where this flight lands (D8)
        map.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          duration: 2800,
          curve: 1.3,
          essential: true,
        });

        const res = await placesNear(latitude, longitude, NEARBY_SEARCH_RADIUS_KM);
        setLocating(false);
        if (res.ok) {
          setNearby(res.places);
          if (res.places.length === 0) {
            setLocateError(
              `No places on the map within ${NEARBY_SEARCH_RADIUS_KM}km of you yet.`,
            );
          }
        } else {
          setLocateError(res.error);
        }
      },
      (err) => {
        setLocating(false);
        setDenied(err.code === err.PERMISSION_DENIED);
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

    // Attribution moves to the opposite corner. MapControls owns the bottom
    // right outright now, and two things sharing that corner was the entire
    // reason globals.css needed !important margins to hold them apart.
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      }),
      "bottom-left",
    );
    // No NavigationControl. Zoom lives in MapControls and calls map.zoomIn() /
    // map.zoomOut() directly, so the stack is positioned by one system instead
    // of a MapLibre corner being dragged into place by CSS.

    // Remember where you were looking, so a fresh visit doesn't throw you back
    // to the whole continent. `moveend` covers pans, zooms and flights alike —
    // except the "near me" flight, whose landing is skipped (see suppressSaveRef).
    map.on("moveend", () => {
      if (suppressSaveRef.current) {
        suppressSaveRef.current = false;
        return;
      }
      const c = map.getCenter();
      saveView({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
    });

    map.on("error", (e) => {
      const msg = e.error?.message ?? "Map resource failed to load";
      console.error("[map]", msg, e);
      // A glyph range that fails is cosmetic — MapLibre renders the codepoint
      // locally and carries on. Declaring the whole map failed over it would
      // turn a font hiccup into a dead homepage (same fix as LocationPicker).
      if (/glyph/i.test(msg)) return;
      setFailed(msg);
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
            0.38,
            10,
            0.46,
            14,
            0.62,
          ],
          "icon-anchor": "center",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": 1,
        },
      });

      // The count, as a badge on the marker's upper-right edge.
      //
      // It used to sit centred ON the photograph. That put dark green text with
      // a white halo over an arbitrary image — the hardest legibility case
      // available — and covered whatever the photo was of. Worse, a number in
      // the middle of a circle reads as "this is a number"; a badge on the edge
      // reads as "a place, and there are others", which is what a cluster is.
      //
      // EVERY NUMBER BELOW IS DERIVED, NOT CHOSEN. The badge and the sprite are
      // drawn by different systems in different units, and that mismatch is
      // easy to ship without noticing:
      //
      //   the sprite's ring  = ICON_RING device px ÷ pixelRatio 2 × icon-size
      //                      = 7 ÷ 2 × icon-size = 3.5 × icon-size CSS px
      //   the sprite's disc  = (ICON_CANVAS/2 - ICON_PAD) ÷ 2 × icon-size
      //                      = 32.5 × icon-size CSS px
      //   a circle layer's stroke and radius = plain CSS px, NOT scaled at all
      //
      // So a fixed circle-stroke-width matches the sprite's ring at exactly one
      // zoom and is wrong everywhere else — which is why the badge's border read
      // as heavier than the marker's. Each value is interpolated across the same
      // zoom stops as icon-size (0.38 / 0.46 / 0.62), computed from the two
      // lines above:
      //
      //   marker radius : 12.4 / 15.0 / 20.2
      //   ring width    :  1.3 /  1.6 /  2.2   (3.5 × icon-size)
      //   badge radius  :  5.9 /  7.2 /  9.7   (marker radius × 0.48)
      //   edge offset   :  8.7 / 10.6 / 14.2   (marker radius × 0.707, the 45° point)
      //
      // If icon-size changes, recompute these. They are not independent knobs.
      map.addLayer({
        id: "place-cluster-badge",
        type: "circle",
        source: SRC,
        filter: ["all", ["has", "point_count"], ["!=", ["get", "icon"], ""]],
        paint: {
          "circle-color": "#b06a3f",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            1.3,
            10,
            1.6,
            14,
            2.2,
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            5.9,
            10,
            7.2,
            14,
            9.7,
          ],
          "circle-translate": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            ["literal", [8.7, -8.7]],
            10,
            ["literal", [10.6, -10.6]],
            14,
            ["literal", [14.2, -14.2]],
          ],
          // Both translate properties default to a "map" anchor, which rotates
          // the offset with the map's bearing — two-finger rotate would swing
          // the badge around the marker. Viewport keeps it upper-right always.
          "circle-translate-anchor": "viewport",
        },
      });

      map.addLayer({
        id: "place-cluster-count",
        type: "symbol",
        source: SRC,
        filter: ["all", ["has", "point_count"], ["!=", ["get", "icon"], ""]],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Medium"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9.5, 10, 10.5, 14, 12.5],
          "text-anchor": "center",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          // White on ochre needs no halo — the badge itself is the contrast.
          "text-color": "#ffffff",
          // text-translate rather than text-offset: offset is in ems and would
          // drift as text-size changes, which is the same drift problem again.
          "text-translate": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            ["literal", [8.7, -8.7]],
            10,
            ["literal", [10.6, -10.6]],
            14,
            ["literal", [14.2, -14.2]],
          ],
          "text-translate-anchor": "viewport",
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

      // The selected place's halo.
      //
      // Added BEFORE the marker layers so it renders underneath them — it reads
      // as a ring around the photo rather than a wash over it. The filter starts
      // matching nothing; the effect below swaps in the selected id.
      //
      // A separate layer rather than feature-state, because the obvious
      // approach doesn't work: icon-size is a LAYOUT property, and layout
      // properties can't read feature-state. Growing the marker itself on
      // selection is therefore not available; a halo underneath it is.
      map.addLayer({
        id: "place-selected",
        type: "circle",
        source: SRC,
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], ""]],
        paint: {
          "circle-color": "#4a5d43",
          "circle-opacity": 0.16,
          "circle-stroke-color": "#4a5d43",
          "circle-stroke-width": 2.5,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            12,
            10,
            17,
            14,
            24,
            18,
            29,
          ],
        },
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

  // Point the halo at whichever place is open.
  //
  // Without this, tapping a marker opened the sheet but left the map unchanged,
  // so in a cluster of nearby places there was nothing connecting what you were
  // reading to which dot it came from.
  //
  // An empty string never matches a real id (they're cuids), so it's the "no
  // selection" filter. `places` is a dependency because the layer is recreated
  // whenever the source is rebuilt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("place-selected")) return;
    map.setFilter("place-selected", [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "id"], selected?.id ?? ""],
    ]);
  }, [selected, places]);

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

      {/* Suggest, near me, zoom — one stack, one corner. The position read is
          still a one-off and still never stored (D8).

          `suggestInvited` costs no extra query: placesNear already returns
          metres, nearest first, so "nothing within 500m" is just reading the
          first row (UX §7c, NEARBY_RADIUS_M). */}
      <MapControls
        locateState={
          locating
            ? "locating"
            : denied
              ? "denied"
              : accuracy !== null
                ? "found"
                : "idle"
        }
        onLocate={findNearMe}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        suggestInvited={
          nearby !== null &&
          !(nearby[0] && nearby[0].metres <= NEARBY_RADIUS_M)
        }
        sheetOpen={!!(selected || nearby?.length || locateError)}
      />

      {/* What the location turned up — or why it didn't. Ochre leads the
          header because this list is anchored to YOU (the ochre "me" dot),
          unlike everything else on the map, which is eucalypt-place. */}
      {(nearby?.length || locateError) && !selected && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:left-4 sm:right-auto sm:w-96 sm:p-4">
          <div className="aib-sheet overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--paper)] shadow-lg">
            <div className="flex items-baseline justify-between border-b border-[var(--border)] px-4 py-3">
              <div>
                <p className="specimen-label text-[var(--ochre)]">Near you</p>
                {nearby && nearby.length > 0 && (
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {nearby.length} place{nearby.length === 1 ? "" : "s"} within{" "}
                    {NEARBY_SEARCH_RADIUS_KM} km
                    {accuracy !== null && (
                      <span className="opacity-70"> · ±{Math.round(accuracy)} m</span>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setNearby(null);
                  setLocateError(null);
                  setAccuracy(null);
                }}
                className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
              >
                Close
              </button>
            </div>

            {locateError && (
              <p className="px-4 py-4 text-sm leading-relaxed text-[var(--muted)]">
                {locateError}
              </p>
            )}

            {nearby && nearby.length > 0 && (
              <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto">
                {nearby.map((p) => (
                  <li key={p.slug}>
                    <button
                      onClick={() => router.push(`/location/${p.slug}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--paper-2)]"
                    >
                      {/* The place's face — a photo makes the "go here?" case
                          better than a name can. No face yet → a quiet
                          category placeholder, never a broken image. */}
                      {p.face ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.face}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[var(--paper-2)] text-lg text-[var(--eucalypt)]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {p.name.charAt(0)}
                        </span>
                      )}

                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[1.02rem] leading-snug text-[var(--ink)]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {p.name}
                        </span>
                        <span className="specimen-label mt-0.5 block truncate">
                          {p.kind}
                          {p.place ? ` · ${p.place}` : ""}
                        </span>
                      </span>

                      <span className="shrink-0 text-right text-sm tabular-nums text-[var(--muted)]">
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
