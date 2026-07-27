// components/map/chrome.ts — the shared look of anything floating on the map.
//
// The top nav and the bottom control stack are separate components that must
// read as one system. Duplicating these strings is exactly how two pieces of
// chrome silently drift apart over a few edits — one gets a new shadow, the
// other doesn't, and the map starts looking assembled rather than designed.
//
// Class strings rather than a wrapper component, because the elements they
// apply to genuinely differ: a link, a button, and a menu panel.
//
// THE SURFACE, refined. Floating chrome reads as "eucalypt-tinted glass"
// rather than plain paper — a faint wash of the palette's own green mixed into
// the paper base, so the controls feel crafted and subtly distinct from the
// bottom SHEETS (which stay plain paper, because they hold reading content and
// want maximum legibility). The tint is small on purpose: enough to warm the
// glass and separate chrome from content, never enough to read as a coloured
// button. Blue was considered and rejected — it's the generic map-UI accent
// and would read as pasted in from another product against this warm palette.
//
// Three moves toward "floating glass" rather than "bordered box":
//   1. No hard border — a hairline shadow-ring separates it from busy tiles
//      without the box, so it hovers ABOVE the map rather than sitting ON it.
//   2. Genuinely glassy: the eucalypt-tinted base at ~82% over heavy blur, so
//      tiles ghost through and the control belongs to the map.
//   3. A layered soft shadow (close contact + far ambient) for believable lift.
// Everything inherits through the variables, so dark mode gets a dark green
// glass — which is why the stack correctly stays dark over dark tiles.
export const MAP_SURFACE =
  "bg-[color-mix(in_srgb,var(--eucalypt)_10%,var(--paper))]/85 backdrop-blur-md " +
  "shadow-[0_0_0_1px_color-mix(in_srgb,var(--eucalypt)_18%,transparent)," +
  "0_2px_6px_-1px_rgb(0_0_0_/_0.12),0_8px_24px_-6px_rgb(0_0_0_/_0.20)]";

// 44px — the touch target floor. Icons inside render at 17-19px; the button is
// bigger than what it draws, which is what makes minimal chrome usable on a
// phone rather than merely small.
//
// Hover is a gentle SURFACE shift — the glass warms slightly toward the card
// tint — not an accent wash. An earlier version tinted the whole button
// eucalypt on hover, which collided with the ink-coloured icon and made it hard
// to read: accent-on-accent. The icon must stay dark and legible at every
// state, so hover moves the BACKGROUND a notch, never toward the icon's own
// hue. Contrast is the point; the tint is only a touch-feedback cue.
//
// SHAPE IS THE CALLER'S JOB, not baked in here: single actions add
// `rounded-full` (they're circles), the zoom pair stays square inside its
// rounded-2xl block. Baking a radius into the shared class broke the zoom
// block, which is exactly the kind of drift this file exists to prevent.
export const MAP_BUTTON =
  "group relative grid size-11 place-items-center " +
  "transition-[background-color,transform,color] duration-150 " +
  "hover:bg-[var(--paper-2)] " +
  "active:scale-[0.92] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[var(--eucalypt)] disabled:opacity-50 disabled:active:scale-100";
