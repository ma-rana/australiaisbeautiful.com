// lib/queries/visibility.ts — the visibility predicates, in ONE place.
//
// SECURITY.md §3: what the public may see is a data-layer rule, not a UI rule.
// Every public-facing query composes these fragments instead of hand-writing
// `status: "APPROVED"` at each call site — because the day someone adds a new
// surface and forgets `isPublic: true`, a contributor's private moment leaks.
// A predicate that exists once can't be half-remembered.
//
// These are deliberately plain objects (not functions with options): if a
// surface needs something different, that difference should be loud at the
// call site, not hidden behind a parameter.

/** A location the public may see. */
export const publicLocationWhere = {
  status: "APPROVED",
} as const;

/** A moment the public may see: moderation-approved AND the owner kept it public. */
export const publicMomentWhere = {
  status: "APPROVED",
  isPublic: true,
} as const;

/** A media file the public may see (per-file moderation — schema MomentMedia). */
export const publicMediaWhere = {
  status: "APPROVED",
} as const;
