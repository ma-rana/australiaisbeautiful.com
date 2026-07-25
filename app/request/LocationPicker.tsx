"use client";

// app/request/LocationPicker.tsx — point at the place on a map.
//
// Replaces the raw latitude/longitude inputs as the PRIMARY way to say where a
// place is. Coordinates are how databases think, not how people do — "it's
// here" is a gesture at a map. The raw fields still exist behind a toggle,
// because they're genuinely useful (pasting coords from another app, precision
// work) — demoted, not deleted.
//
// CENTER-PIN PATTERN (the Uber pickup interaction): the pin is fixed at the
// centre of the viewport and you move the MAP underneath it. Chosen over
// tap-to-place or a draggable marker deliberately: it's one gesture instead of
// gesture-plus-aim, it works identically with fat thumbs on a phone, and
// "where's my pin" is never a question — it's always in the middle.
//
// Same cartography as the homepage: the one pmtiles archive, the same style,
// the same Australia clamp. The picker should feel like a hand-window onto THE
// map, not a second map product.
//
// PRIVACY (D8): "use my current location" is a one-off read to aim the camera.
// The only thing that leaves this component is the pin the person chooses to
// submit; nothing is stored, and the fromMyLocation flag records only that the
// pin was self-located — it's a curator trust signal, not a track.

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AUSTRALIA_BOUNDS,
  AUSTRALIA_MAX_BOUNDS,
  loadView,
  saveView,
} from "@/components/map/camera";

// Same module-scope registration reasoning as MapView. addProtocol called from
// two modules just replaces the handler with an identical one — harmless.
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolRegistered = true;
}

const AUSTRALIA_LAND = AUSTRALIA_BOUNDS; // alias: geolocation sanity check

// The "you are here" halo, shown after "use my current location": a dot at
// your position with a translucent ring at the reported ACCURACY radius — so
// the map is honest about how approximate the fix is (a desktop WiFi lookup
// can be 50m out; the ring says so instead of the dot pretending precision).
//
// OCHRE, not the conventional blue, and deliberately: in this design system
// ochre already MEANS "you" — the homepage me-dot is ochre, the Near-You
// sheet leads ochre. One colour, one meaning. If the familiar Google blue is
// preferred after seeing it, change ME_COLOR to "#4285f4" and ME_FILL's rgb
// to 66,133,244 — nothing else needs touching.
const ME_SRC = "picker-me";
const ME_COLOR = "#b06a3f"; // var(--ochre) — layer paint can't read CSS vars
const ME_FILL = "rgba(176, 106, 63, 0.14)";

// A circle layer's radius is in PIXELS; the accuracy is in METRES. The bridge
// is exponential zoom interpolation: metres-per-pixel halves with each zoom
// level, so px(z) = px(0) × 2^z renders a circle of constant ground size.
// px(0) = metres ÷ (equator circumference ÷ 512px world × cos latitude).
function accuracyRadiusStops(metres: number, lat: number) {
  const mppAtZ0 = (40075016.686 / 512) * Math.cos((lat * Math.PI) / 180);
  const px0 = metres / mppAtZ0;
  return [
    "interpolate",
    ["exponential", 2],
    ["zoom"],
    0,
    px0,
    22,
    px0 * 2 ** 22,
    // Cast: this is a style expression; the paint property's declared type is
    // the resolved value. Casting through unknown keeps us independent of
    // which style-spec type names maplibre v5 exports.
  ] as unknown as number;
}

// Add the halo, or move it. Idempotent; safe to call on every locate.
function showMeHalo(
  map: maplibregl.Map,
  lng: number,
  lat: number,
  accuracyM: number,
) {
  const apply = () => {
    const data: GeoJSON.Feature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {},
    };
    const src = map.getSource(ME_SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      // Accuracy (and latitude) may differ on a re-locate — recompute.
      map.setPaintProperty(
        "picker-me-accuracy",
        "circle-radius",
        accuracyRadiusStops(accuracyM, lat),
      );
      return;
    }
    map.addSource(ME_SRC, { type: "geojson", data });
    map.addLayer({
      id: "picker-me-accuracy",
      type: "circle",
      source: ME_SRC,
      paint: {
        "circle-radius": accuracyRadiusStops(accuracyM, lat),
        "circle-color": ME_FILL,
        "circle-stroke-color": ME_COLOR,
        "circle-stroke-width": 1.5,
        "circle-stroke-opacity": 0.6,
        "circle-pitch-alignment": "map", // a ground circle, not a screen dot
      },
    });
    map.addLayer({
      id: "picker-me-dot",
      type: "circle",
      source: ME_SRC,
      paint: {
        "circle-radius": 6,
        "circle-color": ME_COLOR,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });
  };
  if (map.isStyleLoaded()) apply();
  else map.once("load", apply);
}

export type PickedPoint = {
  latitude: number;
  longitude: number;
  /** True when the pin came from browser geolocation (curator trust signal). */
  fromMyLocation: boolean;
};

export function LocationPicker({
  value,
  onChange,
}: {
  value: PickedPoint | null;
  onChange: (p: PickedPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Swallow moveends we caused (easeTo after locate/manual entry) so they don't
  // re-fire onChange and clobber the fromMyLocation flag with `false`.
  const programmaticMoves = useRef(0);
  // Ignore the settling moves before the map is actually ready — the initial
  // fit isn't a person choosing a spot.
  const readyRef = useRef(false);
  // The current onChange, readable from map handlers without rebinding them.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [manual, setManual] = useState(false);
  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // If the mini map itself dies (style, tiles, WebGL), the form must not die
  // with it — the manual fields become the primary input instead of a hidden
  // escape hatch, and the dead canvas is replaced with an honest note.
  const [mapFailed, setMapFailed] = useState(false);

  const picked = value !== null;

  // Boot the mini map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtilesProtocol();

    // Parity with MapView: a constructor throw (WebGL refused, bad option)
    // must surface as the failure state, not as a silently empty container —
    // an empty container just shows the page background through, which in
    // dark mode looks like a dead black map.
    let map: maplibregl.Map;
    try {
      // Open where the person was last looking — the SAME saved view the
      // homepage map keeps (see ./camera). Browsing the big map near a gorge
      // and then opening /request to suggest it is the expected flow; starting
      // the picker at the whole continent threw that context away.
      const saved = loadView();
      map = new maplibregl.Map({
        container: containerRef.current,
        style: "/map/style.json",
        ...(saved
          ? {
              center: [saved.lng, saved.lat] as [number, number],
              zoom: saved.zoom,
            }
          : { bounds: AUSTRALIA_BOUNDS, fitBoundsOptions: { padding: 12 } }),
        maxBounds: AUSTRALIA_MAX_BOUNDS,
        minZoom: 3,
        maxZoom: 19,
        attributionControl: false,
      });
    } catch (e) {
      console.error("[location-picker] constructor", e);
      setMapFailed(true);
      return;
    }
    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    map.once("idle", () => {
      readyRef.current = true;
    });

    map.on("error", (e) => {
      const msg = e.error?.message ?? String(e);
      console.error("[location-picker]", msg);
      // Only genuinely fatal failures kill the picker. A glyph range that
      // won't load is cosmetic — MapLibre renders the codepoint locally and
      // says so — and tearing the whole map down over it turned a missing
      // font file into a dead form. (That's exactly what happened when the
      // old remote glyph host started returning garbage.)
      if (/glyph/i.test(msg)) return;
      setMapFailed(true);
    });

    // Every settled camera position IS the pin (centre-pin pattern) — but only
    // once the map is ready, and not for moves this component made itself.
    map.on("moveend", () => {
      if (!readyRef.current) return;
      if (programmaticMoves.current > 0) {
        programmaticMoves.current -= 1;
        return;
      }
      const c = map.getCenter();
      onChangeRef.current({
        latitude: c.lat,
        longitude: c.lng,
        fromMyLocation: false,
      });
      // Share the view back (see ./camera): a hand-chosen pan is a view
      // preference, same as on the big map. Programmatic moves — including
      // the locate flight — were swallowed above, so a geolocation-derived
      // camera is never persisted (D8).
      saveView({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    // The same resize trio MapView uses: constructor measures once (possibly
    // mid-layout), next frame catches settled flex layout, `load` catches
    // fonts-and-style settling after the dynamic-chunk swap.
    requestAnimationFrame(() => map.resize());
    map.once("load", () => map.resize());

    return () => {
      ro.disconnect();
      try {
        map.remove();
      } catch {
        // Already torn down by the failure path — fine.
      }
      mapRef.current = null;
    };
  }, []);

  // When the map fails and its container unmounts, tear the instance down —
  // otherwise it sits orphaned, holding a WebGL context for a canvas that's
  // no longer in the document.
  useEffect(() => {
    if (mapFailed && mapRef.current) {
      try {
        mapRef.current.remove();
      } catch {
        // A map that's already broken may throw on teardown; nothing to do.
      }
      mapRef.current = null;
    }
  }, [mapFailed]);

  // Keep the manual fields showing wherever the pin actually is.
  useEffect(() => {
    if (value) {
      setLatText(value.latitude.toFixed(6));
      setLngText(value.longitude.toFixed(6));
    } else {
      setLatText("");
      setLngText("");
    }
  }, [value]);

  const aimAt = (
    latitude: number,
    longitude: number,
    fromMyLocation: boolean,
    zoom?: number,
  ) => {
    const map = mapRef.current;
    if (map) {
      programmaticMoves.current += 1;
      map.easeTo({
        center: [longitude, latitude],
        ...(zoom !== undefined ? { zoom } : {}),
        duration: 700,
      });
    }
    onChange({ latitude, longitude, fromMyLocation });
  };

  const useMyLocation = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("This browser can't share a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const [[w, s], [e, n]] = AUSTRALIA_LAND;
        if (longitude < w || longitude > e || latitude < s || latitude > n) {
          setGeoError("You're outside Australia — drop the pin by hand instead.");
          return;
        }
        // The halo: your position with the accuracy radius drawn honestly.
        // It stays put if you then drag the pin elsewhere — the halo is where
        // YOU are, the pin is the PLACE; they're allowed to disagree.
        if (mapRef.current) {
          showMeHalo(mapRef.current, longitude, latitude, Math.max(accuracy, 20));
        }
        aimAt(latitude, longitude, true, 15);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was declined — drag the map to the spot instead."
            : "Couldn't work out where you are — drag the map to the spot instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  // Manual coordinates: commit on blur. Typing shouldn't yank the camera on
  // every keystroke.
  const commitManual = () => {
    const latitude = Number(latText);
    const longitude = Number(lngText);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const [[w, s], [e, n]] = AUSTRALIA_MAX_BOUNDS;
    if (longitude < w || longitude > e || latitude < s || latitude > n) {
      setGeoError("Those coordinates are outside Australia.");
      return;
    }
    setGeoError(null);
    aimAt(latitude, longitude, false, 14);
  };

  return (
    <div>
      {/* The map, with the fixed centre pin over it — or, if the map itself
          failed, an honest note with the coordinates promoted to primary. */}
      {mapFailed ? (
        <div className="mt-2 flex h-32 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--paper-2)] px-6 text-center">
          <p className="text-sm text-[var(--muted)]">
            The map couldn&apos;t load here — use your location or type the
            coordinates below.
          </p>
        </div>
      ) : (
      <div className="relative mt-2 h-72 overflow-hidden rounded-lg border border-[var(--border)]">
        {/* Sized explicitly, NOT via absolute+inset. MapLibre's own stylesheet
            forces .maplibregl-map to position:relative (it loads after Tailwind
            in the dynamic chunk, and at equal specificity the later sheet
            wins), and inset-sizing collapses to height 0 on a relative element
            — maplibre's overflow:hidden then clips a perfectly healthy canvas
            to nothing. Black rectangle, no drag, zero errors. h-full/w-full
            size the box identically under either position value. */}
        <div ref={containerRef} className="h-full w-full" />

        {/* The pin. Its TIP is the exact centre of the viewport — the
            translate puts the point of the teardrop at 50%/50%. Eucalypt like
            every place-anchored mark; pointer-events-none so it never blocks
            the drag it exists to serve. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
        >
          <svg width="34" height="44" viewBox="0 0 34 44" fill="none">
            <path
              d="M17 43C17 43 32 24.6 32 15.5C32 7.2 25.3 1 17 1C8.7 1 2 7.2 2 15.5C2 24.6 17 43 17 43Z"
              fill="var(--eucalypt)"
              stroke="#ffffff"
              strokeWidth="2.5"
            />
            <circle cx="17" cy="15.5" r="5" fill="#ffffff" />
          </svg>
          {/* Grounding dot under the tip, so the pin reads as touching the map
              rather than floating over it. */}
          <span className="absolute left-1/2 top-full h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/25" />
        </div>

        {/* Until a spot is chosen, say what the gesture is. */}
        {!picked && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="aib-sheet rounded-full border border-[var(--border)] bg-[var(--paper)] px-3.5 py-1.5 text-sm text-[var(--ink)] shadow-sm">
              Drag the map until the pin is on the spot
            </span>
          </div>
        )}
      </div>
      )}

      {/* Under the map: locate, the live readout, and the manual escape hatch. */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] disabled:opacity-50"
        >
          {locating ? "Finding you…" : "Use my current location"}
        </button>

        <p className="specimen-label tabular-nums">
          {value
            ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
            : "No pin yet"}
        </p>
      </div>

      <p className="mt-1.5 text-xs text-[var(--muted)]">
        Your location is used once, to aim the map. Nothing about your movements
        is stored.{" "}
        <button
          type="button"
          onClick={() => setManual((m) => !m)}
          className="underline underline-offset-4 transition-colors hover:text-[var(--ink)]"
        >
          {manual ? "Hide coordinates" : "Type coordinates instead"}
        </button>
      </p>

      {(manual || mapFailed) && (
        <div className="mt-2 flex gap-2">
          <input
            value={latText}
            onChange={(e) => setLatText(e.target.value)}
            onBlur={commitManual}
            placeholder="Latitude"
            inputMode="decimal"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] transition-colors focus:border-[var(--eucalypt)] focus:outline-none focus:ring-2 focus:ring-[var(--eucalypt)]/20"
          />
          <input
            value={lngText}
            onChange={(e) => setLngText(e.target.value)}
            onBlur={commitManual}
            placeholder="Longitude"
            inputMode="decimal"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] transition-colors focus:border-[var(--eucalypt)] focus:outline-none focus:ring-2 focus:ring-[var(--eucalypt)]/20"
          />
        </div>
      )}

      {geoError && <p className="mt-2 text-sm text-[var(--ochre)]">{geoError}</p>}
    </div>
  );
}
