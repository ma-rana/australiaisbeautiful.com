// lib/category.ts — turn a Location.category enum into display text.
//
// One formatter, used by every surface that shows a category (the map's
// nearby sheet, the place-preview sheet, location pages), so they can't
// diverge — and so the OTHER case is handled in exactly one place.
//
// THE OTHER CASE. The enum has an OTHER member for places that don't fit a
// named type. Rendering it as the literal word "other" is worse than useless:
// "other · VIC" reads as a broken label, not a category. So OTHER formats to
// an EMPTY string, and callers drop the category entirely rather than print a
// non-word. A place with no meaningful category simply shows its locality.

export function formatCategory(category: string | null | undefined): string {
  if (!category) return "";
  const c = category.toUpperCase();
  if (c === "OTHER" || c === "UNKNOWN") return "";
  // NATIONAL_PARK -> "national park", BEACH -> "beach"
  return category.toLowerCase().replace(/_/g, " ");
}

// Compose the specimen line the sheets show: "national park · Marysville, VIC",
// gracefully dropping either half when it's absent. Never leaves a dangling
// separator.
export function specimenLine(
  category: string | null | undefined,
  place: string | null | undefined,
): string {
  const kind = formatCategory(category);
  return [kind, place].filter(Boolean).join(" · ");
}
