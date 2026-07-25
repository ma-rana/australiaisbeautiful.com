// components/MapBackdropShell.tsx — the import point for the page backdrop.
//
// Once a dynamic ssr:false boundary (when MapBackdrop mounted a live MapLibre
// instance); now a plain re-export, kept so pages have one stable import that
// survives the backdrop's implementation changing underneath — as it already
// has once (live map → snapshot).

export { MapBackdrop as MapBackdropShell } from "./map/MapBackdrop";
