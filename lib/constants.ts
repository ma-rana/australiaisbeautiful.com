// lib/constants.ts — fixed spatial constants.
//
// UX_PATTERNS §7c is explicit that these are code constants and NOT admin
// settings: "Nobody sits in an admin panel deciding today's near-me radius —
// it's a value you pick once, tune in code against real behaviour, and leave.
// Exposing it as a setting is a UI and a config row for a knob no one turns."
//
// They live together HERE so that "fixed" means findable-and-one-edit rather
// than magic numbers scattered across queries and JSX. Before this file they
// were in three places: 150 in request/actions.ts, 50km defaulted in
// nearby-actions.ts, and 500 written inline in a MapView prop.
//
// The general principle from the same section: a value earns being a setting
// only when a human would genuinely change it at runtime. These don't.
// (Contrast Location.ratingThreshold, which IS a per-location field — a
// flagship place might legitimately differ. That earns it; radii don't.)

/**
 * How close two pins must be to count as the same place, for request
 * clustering and duplicate detection.
 *
 * Tight enough not to merge neighbouring places, loose enough that two people
 * pinning opposite ends of a reserve still group together.
 *
 * NOTE: UX_PATTERNS §7c documents this as 200m; the implementation has used
 * 150m since the request flow was built, with the reasoning above. The value
 * here preserves current behaviour — one of the two should be corrected so
 * they stop disagreeing.
 */
export const DEDUP_RADIUS_M = 150;

/**
 * The generous "you're already standing at this place" check.
 *
 * Deliberately larger than DEDUP_RADIUS_M (§7c): someone at a big place — a
 * national park, a long beach — can be a few hundred metres from the pin and
 * still clearly be AT it. Better to occasionally suppress "suggest a place"
 * near somewhere that's already on the map than to invite a duplicate request
 * for a place that's plainly listed.
 */
export const NEARBY_RADIUS_M = 500;

/**
 * How far out the near-me panel looks for places worth listing.
 *
 * Different job from the two above: not "am I here" but "what's within
 * reach" — a drive rather than a walk, so it's kilometres, not metres.
 */
export const NEARBY_SEARCH_RADIUS_KM = 50;

/**
 * The ON-SITE zone: how close a suggestion pin must be to the requester's own
 * located position to count as "made from the place itself".
 *
 * This is the radius the picker draws as a ring after "use my current
 * location", and — critically — the radius the SERVER re-checks on submit
 * (app/request/actions.ts). The client flag alone is forgeable; the server
 * verifies the pin sits within this distance of the reported position before
 * accepting the request.
 *
 * Generous on purpose (larger than DEDUP): a person standing at a big place
 * may pin a lookout a few hundred metres from where they're standing and still
 * plainly be there. The accuracy of the browser fix is ADDED to this at the
 * check, so a poor GPS fix doesn't wrongly reject an honest on-site pin.
 *
 * NOTE: this is a SIGNAL-turned-REQUIREMENT (product decision 2026-07-25). It
 * deters casual armchair pins; it cannot defeat a determined spoofer (browser
 * geolocation is client-claimed). Real quality control is the curator queue.
 */
export const ONSITE_RADIUS_M = 750;
