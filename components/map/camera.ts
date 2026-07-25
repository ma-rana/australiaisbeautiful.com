// components/map/camera.ts — the shared camera: bounds and the saved view.
//
// Extracted from MapView when LocationPicker became the second map surface.
// BOTH surfaces read and write ONE saved view, deliberately: "where you were
// looking" is a single fact about the person, not a per-widget setting. Browse
// the big map near a gorge, open /request to suggest it — the picker starts
// right there instead of at the whole continent. And the pin you line up in
// the picker leaves the big map pointed at the same neighbourhood.
//
// Where the camera was left last time: stored in localStorage so it survives
// the browser being closed and reopened — the Google Maps behaviour. This is
// a VIEW preference, not a location: it records where you were looking, which
// is a different thing from where you were. Nothing derived from geolocation
// is ever written here (D8) — both surfaces suppress saving for camera moves
// that follow a geolocation read, each with its own mechanism (MapView's
// suppressSaveRef; the picker's programmatic-move counter).
//
// Versioned key: if the shape ever changes, bump the suffix and old values are
// simply ignored rather than half-parsed.

/** The initial view: the whole continent. */
export const AUSTRALIA_BOUNDS: [[number, number], [number, number]] = [
  [112, -44],
  [154, -9],
];

/**
 * The camera clamp. Slightly looser than the fit so fitBounds has room to work
 * (setting both identical makes the fit fight the clamp and shoves the camera
 * into a corner), but tight enough that you can't pan far past the coast into
 * the area the tileset doesn't cover — which renders as empty background and
 * reads as a broken layout rather than as ocean.
 */
export const AUSTRALIA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [109, -46],
  [157, -7],
];

const VIEW_KEY = "aib:map-view:v1";

export type SavedView = { lng: number; lat: number; zoom: number };

/**
 * A saved view is only trusted if it still makes sense: finite numbers, inside
 * the camera clamp, inside the zoom range. Anything else (corrupt JSON, a
 * value written by an older build, someone editing devtools) falls back to the
 * continent — a wrong-but-valid view is worse than the default, because the
 * clamp would drag the camera to an edge and the map would look broken.
 */
export function loadView(): SavedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedView;
    if (
      !Number.isFinite(v.lng) ||
      !Number.isFinite(v.lat) ||
      !Number.isFinite(v.zoom)
    ) {
      return null;
    }
    const [[w, s], [e, n]] = AUSTRALIA_MAX_BOUNDS;
    if (v.lng < w || v.lng > e || v.lat < s || v.lat > n) return null;
    if (v.zoom < 3 || v.zoom > 19) return null;
    return v;
  } catch {
    return null;
  }
}

export function saveView(v: SavedView) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    // Storage can be unavailable (private mode, quota). Losing the saved view
    // is a minor inconvenience, not worth failing over.
  }
}
