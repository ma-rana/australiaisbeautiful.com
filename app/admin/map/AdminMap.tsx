"use client";

// app/admin/map/AdminMap.tsx — the curator's map: work where the task is spatial.
//
// ADMIN.md §2c: judging whether a place belongs IS spatial — what's nearby, is
// it a duplicate, where's the demand. So pending request clusters render as a
// staff-only pin layer over the real map, and the review happens in a panel
// beside the pin, in geographic context. A request pin sitting on top of an
// existing eucalypt dot is a duplicate you can SEE — the thing the list view
// can never show.
//
// TWO LAYERS, two meanings, traffic-light clear:
//   green (eucalypt) dots = APPROVED locations — on the map, all good.
//   red circles           = OPEN explorer requests — awaiting a decision.
//                           Sized by demand, badged with the count, tap to
//                           review.
//
// The panel reuses ClusterCard verbatim — the same audited approve/reject
// actions as /requests. The map is a new VIEW onto the same mutation path,
// never a second one (D14: an action that isn't audited didn't happen).
//
// Deliberately NOT reusing the public MapView: that component carries public
// concerns (nearby search, preview sheets, saved views, parting snapshots)
// that a workbench doesn't want. The ~60 lines of bootstrapping are duplicated
// instead of entangled. Camera bounds/clamp ARE shared (components/map/camera)
// — but not the saved view: staff open to the overview, and an admin surface
// must not overwrite where a person was browsing publicly (separate jobs).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AUSTRALIA_BOUNDS,
  AUSTRALIA_MAX_BOUNDS,
  ADMIN_VIEW_KEY,
  loadView,
  saveView,
} from "@/components/map/camera";
import { ClusterCard, type QueueCluster } from "../requests/ClusterCard";

// Same module-scope registration rule as MapView: the protocol is global to
// maplibre; registering in an effect gets torn out from under live maps by
// StrictMode double-mounts. Guarded so both surfaces can each call it safely.
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

export type AdminMapLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Moments gone live here in the last 7 days (0 for curators — role-scoped). */
  recent: number;
};

// Colours are literal, not var()-based — same reasoning as the public map's
// me-dot: MapLibre paints into its own canvas, and a layer that silently
// renders wrong because a CSS variable didn't resolve is worse than one a
// theme change misses. Traffic-light semantics: green = approved and settled;
// red = an explorer's request awaiting a decision (admin.css --danger).
const LOCATION_DOT = "#2d4739"; // --action, deep eucalypt — approved, on the map
const REQUEST_PIN = "#8f2d2d"; // --danger, red — open request, needs a decision

const SRC_LOCATIONS = "admin-locations";
const SRC_REQUESTS = "admin-requests";

export function AdminMap({
  locations,
  clusters: initialClusters,
  role,
}: {
  locations: AdminMapLocation[];
  clusters: QueueCluster[];
  /** Drives which layers this staff member works: requests for curators,
   *  activity/drill-in for moderators, both for admins — the same job focus
   *  as the rail. Routes still guard themselves; this is presentation. */
  role: "CURATOR" | "MODERATOR" | "ADMIN";
}) {
  // Job focus, mirrored from the rail: requests are curation work, the
  // moment drill-in is moderation work, the admin does both.
  const canRequests = role === "CURATOR" || role === "ADMIN";
  const canModerate = role === "MODERATOR" || role === "ADMIN";

  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The work list lives in state so a decision drops its pin immediately —
  // the map must never show a request someone just decided (stale work is
  // the classic dashboard failure).
  const [clusters, setClusters] = useState(initialClusters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = clusters.find((c) => c.id === selectedId) ?? null;

  // A tapped PLACE (moderator drill-in). Selection, not navigation: the tap
  // brings the map closer and opens a small card; leaving for the grid is an
  // explicit button press. A zoomed-out click that instantly redirects yanks
  // you off the map before you've seen where you are — the same look-then-go
  // grammar as the public map's preview sheet.
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const selectedLocation =
    locations.find((l) => l.id === selectedLocationId) ?? null;

  // The "On the map" layer: OFF by default for curators and moderators (the
  // map opens on their work), ON by default for the ADMIN — the overview role
  // starts with the full picture and can fold it away. The legend's green row
  // is the toggle either way.
  const [showApproved, setShowApproved] = useState(role === "ADMIN");

  // GeoJSON for the work layer, rebuilt when the list changes.
  const requestsGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: clusters.map((c) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [c.longitude, c.latitude] as [number, number],
        },
        properties: {
          id: c.id,
          name: c.displayName,
          demand: c.requestCount,
        },
      })),
    }),
    [clusters],
  );

  // --- Map bootstrap (once) -------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtilesProtocol();

    // Where this staff member was last working — the ADMIN key, never the
    // public one (see camera.ts). Present → the map reopens there; absent
    // (first visit) → the work-framing below takes over.
    const savedAdminView = loadView(ADMIN_VIEW_KEY);

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: "/map/style.json",
        ...(savedAdminView
          ? {
              center: [savedAdminView.lng, savedAdminView.lat] as [number, number],
              zoom: savedAdminView.zoom,
            }
          : { bounds: AUSTRALIA_BOUNDS, fitBoundsOptions: { padding: 24 } }),
        maxBounds: AUSTRALIA_MAX_BOUNDS,
        minZoom: 3,
        maxZoom: 19,
        attributionControl: false,
      });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Map failed to start");
      return;
    }
    mapRef.current = map;

    // Remember where the work left off — pans, zooms and eased flights alike.
    // No geolocation suppression needed here: the admin map has no near-me,
    // so every camera position is a view choice, safe to persist (D8).
    map.on("moveend", () => {
      const c = map.getCenter();
      saveView({ lng: c.lng, lat: c.lat, zoom: map.getZoom() }, ADMIN_VIEW_KEY);
    });

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      }),
      "bottom-left",
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    map.on("error", (e) => {
      const msg = e.error?.message ?? "Map resource failed to load";
      console.error("[admin-map]", msg, e);
      if (/glyph/i.test(msg)) return; // cosmetic — MapLibre carries on
      setFailed(msg);
    });

    // Same canvas-size guard as the public map: MapLibre measures once at
    // construction, and an admin shell whose flex layout is still settling
    // leaves a blank strip otherwise.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());
    map.once("load", () => map.resize());

    const addLayers = () => {
      // CONTEXT — every approved location, small eucalypt dots. Read-only:
      // they exist so a request pin near (or on) one is visibly a duplicate.
      map.addSource(SRC_LOCATIONS, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: locations.map((l) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [l.longitude, l.latitude] },
            properties: { id: l.id, name: l.name, recent: l.recent },
          })),
        },
      });
      // Selection halo for a tapped PLACE — same device as the request halo,
      // in the place's own eucalypt, under the dots.
      map.addLayer({
        id: "admin-location-selected",
        type: "circle",
        source: SRC_LOCATIONS,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-color": LOCATION_DOT,
          "circle-opacity": 0.16,
          "circle-stroke-color": LOCATION_DOT,
          "circle-stroke-width": 2,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            14,
            10,
            20,
            14,
            26,
          ],
        },
      });
      // QUIET places — nothing new this week. Hidden until the legend's
      // "On the map" row is toggled on (work-first default; the ADMIN's
      // overview starts with it on); the numbered ACTIVE circles below are
      // work and stay visible regardless.
      map.addLayer({
        id: "admin-location-dots",
        type: "circle",
        source: SRC_LOCATIONS,
        filter: ["==", ["get", "recent"], 0],
        layout: { visibility: role === "ADMIN" ? "visible" : "none" },
        paint: {
          "circle-color": LOCATION_DOT,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            3,
            10,
            5.5,
            14,
            8,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.25,
          "circle-opacity": 0.85,
        },
      });
      // ACTIVE places (moderator layer, §2c) — moments landed here this week.
      // Larger, count inside, still eucalypt: activity is the SAME family as
      // the place, just louder. Red keeps its one meaning — a request awaits
      // a decision — so the two work signals can never be confused.
      map.addLayer({
        id: "admin-location-active",
        type: "circle",
        source: SRC_LOCATIONS,
        filter: [">", ["get", "recent"], 0],
        paint: {
          "circle-color": LOCATION_DOT,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            ["step", ["get", "recent"], 8, 5, 10, 15, 12],
            12,
            ["step", ["get", "recent"], 12, 5, 15, 15, 18],
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "admin-location-active-counts",
        type: "symbol",
        source: SRC_LOCATIONS,
        filter: [">", ["get", "recent"], 0],
        layout: {
          "text-field": ["to-string", ["get", "recent"]],
          "text-font": ["Noto Sans Medium"],
          "text-size": 10.5,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "admin-location-labels",
        type: "symbol",
        source: SRC_LOCATIONS,
        minzoom: 10,
        layout: {
          visibility: role === "ADMIN" ? "visible" : "none",
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Medium"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-max-width": 9,
        },
        paint: {
          "text-color": "#2d3a27",
          "text-halo-color": "#faf9f6",
          "text-halo-width": 1.6,
        },
      });

      // THE WORK — open request clusters. RED (the danger accent): an
      // explorer's request awaiting a decision, unmistakable against the
      // green of approved places. Sized by demand, always on top.
      map.addSource(SRC_REQUESTS, { type: "geojson", data: requestsGeo });

      // Selection halo, under the pin, so the panel and the pin stay tied.
      map.addLayer({
        id: "admin-request-selected",
        type: "circle",
        source: SRC_REQUESTS,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-color": REQUEST_PIN,
          "circle-opacity": 0.18,
          "circle-stroke-color": REQUEST_PIN,
          "circle-stroke-width": 2,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            16,
            10,
            22,
            14,
            28,
          ],
        },
      });
      map.addLayer({
        id: "admin-request-pins",
        type: "circle",
        source: SRC_REQUESTS,
        paint: {
          "circle-color": REQUEST_PIN,
          // Demand sizes the pin — the queue's requestCount ordering, spatial.
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            ["step", ["get", "demand"], 7, 3, 9, 8, 11],
            12,
            ["step", ["get", "demand"], 11, 3, 14, 8, 17],
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "admin-request-counts",
        type: "symbol",
        source: SRC_REQUESTS,
        filter: [">", ["get", "demand"], 1],
        layout: {
          "text-field": ["to-string", ["get", "demand"]],
          "text-font": ["Noto Sans Medium"],
          "text-size": 11,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.on("click", "admin-request-pins", (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        if (!f || !id) return;
        setSelectedId(id);
        setSelectedLocationId(null); // one panel at a time
        map.easeTo({
          center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
          duration: 450,
        });
      });
      map.on("mouseenter", "admin-request-pins", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "admin-request-pins", () => {
        map.getCanvas().style.cursor = "";
      });

      // MODERATOR+ drill-in, in two beats (§2c, look-then-go): tap a place →
      // the camera eases CLOSER to it and a card opens; the grid is behind an
      // explicit "Open moments" press. Curators get no handler — the dots stay
      // context, and never lead to a 403.
      if (canModerate) {
        const selectPlace = (
          e: maplibregl.MapMouseEvent & {
            features?: maplibregl.MapGeoJSONFeature[];
          },
        ) => {
          // A request pin overlapping this dot is exactly the duplicate case
          // the map exists to reveal — and both layers' handlers fire on one
          // click. The REQUEST wins: reviewing it is the decision to make.
          const requestsHere = map.queryRenderedFeatures(e.point, {
            layers: ["admin-request-pins"],
          });
          if (requestsHere.length > 0) return;
          const f = e.features?.[0];
          const id = f?.properties?.id as string | undefined;
          if (!f || !id) return;
          setSelectedLocationId(id);
          setSelectedId(null); // one panel at a time
          // Come CLOSER, never further: from a continent view this flies down
          // to neighbourhood level; already close, it just centres.
          map.easeTo({
            center: (f.geometry as GeoJSON.Point).coordinates as [
              number,
              number,
            ],
            zoom: Math.max(map.getZoom(), 11),
            duration: 650,
          });
        };
        for (const layer of ["admin-location-dots", "admin-location-active"]) {
          map.on("click", layer, selectPlace);
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      }

      // FIRST VISIT ONLY: frame the work. Once a saved view exists, coming
      // back must not restart the camera — you left it somewhere on purpose,
      // and re-fitting on every mount would throw away your working position.
      if (!savedAdminView && requestsGeo.features.length > 0) {
        const b = new maplibregl.LngLatBounds();
        for (const f of requestsGeo.features) {
          b.extend(f.geometry.coordinates as [number, number]);
        }
        map.fitBounds(b, { padding: 80, maxZoom: 10, duration: 0 });
      }

      setReady(true);
    };

    if (map.isStyleLoaded()) addLayers();
    else map.once("load", addLayers);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      // pmtiles protocol deliberately not removed — global and shared.
    };
    // Bootstrap runs once; data updates flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the request source current as decisions land (pins drop instantly).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(SRC_REQUESTS) as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData(requestsGeo);
  }, [requestsGeo, ready]);

  // Point the halos at whatever is open.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("admin-request-selected")) return;
    map.setFilter("admin-request-selected", [
      "==",
      ["get", "id"],
      selectedId ?? "",
    ]);
  }, [selectedId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("admin-location-selected")) return;
    map.setFilter("admin-location-selected", [
      "==",
      ["get", "id"],
      selectedLocationId ?? "",
    ]);
  }, [selectedLocationId, ready]);

  // The legend's "On the map" toggle → layer visibility. Hidden layers also
  // stop catching clicks, so the drill-in handlers need no extra guard.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const v = showApproved ? "visible" : "none";
    for (const layer of ["admin-location-dots", "admin-location-labels"]) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", v);
    }
  }, [showApproved, ready]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-[var(--line)]">
      <div ref={containerRef} className="h-full w-full" />

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)] p-8">
          <div className="max-w-sm text-center">
            <p className="text-base font-semibold">The map didn&apos;t load</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{failed}</p>
          </div>
        </div>
      )}

      {/* Legend — a LAYER CONTROL, not just a key. The work rows (red
          requests; green weekly activity) are always-on readings; the "On the
          map" row is a TOGGLE that lays the approved skeleton under the work
          for the duplicate/context check. Off by default: the map opens on
          the work. And when the queue is clear, it says so — never silently
          bare of red (the framed-emptiness rule, applied to a workbench). */}
      <div className="absolute left-3 top-3 rounded-md border border-[var(--line)] bg-[var(--surface)]/95 px-2 py-1.5 text-xs shadow-sm backdrop-blur-sm">
        {canRequests && (
          <p className="flex items-center gap-2 px-1 py-0.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: REQUEST_PIN }}
            />
            {clusters.length > 0 ? (
              <>
                Requested{" "}
                <span
                  className="admin-data font-semibold"
                  style={{ color: REQUEST_PIN }}
                >
                  {clusters.length}
                </span>
              </>
            ) : (
              <span className="text-[var(--muted)]">No open requests</span>
            )}
          </p>
        )}
        {canModerate && (
          <p className="mt-0.5 flex items-center gap-2 px-1 py-0.5">
            <span
              aria-hidden
              className="admin-data flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
              style={{ background: LOCATION_DOT }}
            >
              {locations.reduce((n, l) => n + l.recent, 0) || "·"}
            </span>
            <span className="text-[var(--muted)]">
              new this week — tap to review
            </span>
          </p>
        )}
        <button
          type="button"
          onClick={() => setShowApproved((s) => !s)}
          aria-pressed={showApproved}
          title={
            showApproved
              ? "Hide approved places"
              : "Show approved places under the work"
          }
          className="mt-0.5 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--sunken)]"
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={
              showApproved
                ? { background: LOCATION_DOT }
                : {
                    background: "transparent",
                    border: `1.5px solid ${LOCATION_DOT}`,
                  }
            }
          />
          <span
            className={
              showApproved ? "text-[var(--ink)]" : "text-[var(--muted)]"
            }
          >
            On the map
          </span>
        </button>
      </div>

      {/* The tapped place's card (moderator) — the look-then-go beat. The tap
          brought the map closer; THIS is where leaving for the grid becomes a
          choice instead of a side effect. */}
      {selectedLocation && !selected && (
        <div className="absolute bottom-3 left-3 z-10 w-[min(20rem,calc(100%-1.5rem))] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-lg">
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="admin-eyebrow">Place</p>
              <p className="mt-0.5 truncate text-sm font-semibold">
                {selectedLocation.name}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {selectedLocation.recent > 0 ? (
                  <>
                    <span
                      className="admin-data font-semibold"
                      style={{ color: "var(--attention)" }}
                    >
                      {selectedLocation.recent}
                    </span>{" "}
                    moment{selectedLocation.recent === 1 ? "" : "s"} this week
                  </>
                ) : (
                  "Nothing new this week"
                )}
              </p>
            </div>
            <button
              onClick={() => setSelectedLocationId(null)}
              className="shrink-0 rounded px-2 py-1 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--sunken)] hover:text-[var(--ink)]"
            >
              Close
            </button>
          </div>
          <div className="border-t border-[var(--line)] px-4 py-3">
            <button
              onClick={() =>
                router.push(`/moments?location=${selectedLocation.id}`)
              }
              className="w-full rounded px-3 py-2 text-sm font-medium text-white transition-colors"
              style={{ background: "var(--action)" }}
            >
              Open moments
            </button>
          </div>
        </div>
      )}

      {/* The review panel — the workbench beside the pin. ClusterCard verbatim:
          the same audited actions as /requests, shown in geographic context. */}
      {selected && (
        <div className="absolute bottom-3 right-3 top-3 z-10 flex w-[min(26rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div className="min-w-0">
              <p className="admin-eyebrow">Requested place</p>
              <p className="admin-data mt-0.5 truncate text-xs text-[var(--muted)]">
                {Math.abs(selected.latitude).toFixed(4)}°
                {selected.latitude >= 0 ? "N" : "S"}{" "}
                {Math.abs(selected.longitude).toFixed(4)}°
                {selected.longitude >= 0 ? "E" : "W"}
              </p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="shrink-0 rounded px-2 py-1 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--sunken)] hover:text-[var(--ink)]"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ClusterCard
              // Keyed so switching pins resets the card's form state — without
              // this, a half-written intro follows you to the next request.
              key={selected.id}
              cluster={selected}
              onDone={() => {
                // Drop the pin after the card's done-state has been seen a
                // beat — instant removal yanks the confirmation away mid-read.
                const id = selected.id;
                setTimeout(() => {
                  setClusters((prev) => prev.filter((c) => c.id !== id));
                  setSelectedId((cur) => (cur === id ? null : cur));
                }, 1600);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
