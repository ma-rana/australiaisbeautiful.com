// app/map-chrome.ts — the shared look of anything floating on the map.
//
// The top nav and the bottom control stack are separate components that must
// read as one system. Duplicating these strings is exactly how two pieces of
// chrome silently drift apart over a few edits — one gets a new shadow, the
// other doesn't, and the map starts looking assembled rather than designed.
//
// Class strings rather than a wrapper component, because the elements they
// apply to genuinely differ: a link, a button, and a menu panel.

export const MAP_SURFACE =
  "border border-[var(--border)] bg-[var(--paper)]/95 backdrop-blur " +
  "shadow-[0_1px_2px_rgb(0_0_0_/_0.07),0_5px_14px_-3px_rgb(0_0_0_/_0.16)]";

// 44px — the touch target floor. Icons inside render at 17-19px; the button is
// bigger than what it draws, which is what makes minimal chrome usable on a
// phone rather than merely small.
export const MAP_BUTTON =
  "group relative grid size-11 place-items-center transition-[background-color,transform,color] " +
  "duration-150 hover:bg-[var(--paper-2)] active:scale-[0.93] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[var(--eucalypt)] disabled:opacity-50 disabled:active:scale-100";
