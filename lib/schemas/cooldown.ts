// lib/schemas/cooldown.ts
// Resubmission cooldown policy — the ONE place the durations live.
//
// This is distinct from rate limiting (SECURITY.md §11). Rate limits stop a
// flood: N per minute, per IP. Cooldowns stop a re-litigation: you were told
// no, so wait before asking again. Different problem, different mechanism.
//
// The rule that matters: FIXABLE gets NO cooldown. If we told someone "your
// coordinates are wrong" and then blocked resubmission for 30 days, we blocked
// the exact correction we asked for and lost a contributor over a typo. On a
// platform whose scarce resource is people willing to contribute, that is a
// self-inflicted wound.

import { z } from "zod";

export type RejectionKind = "OUT_OF_SCOPE" | "FIXABLE" | "DUPLICATE" | "ABUSE";

const DAY_MS = 24 * 60 * 60 * 1000;

// Location / LocationRequest — scope is PER TARGET.
// A rejected submission blocks resubmitting THAT place. It must never block the
// submitter from proposing a different one: someone whose shopfront was
// rejected may have a real hidden gem next week.
const LOCATION_COOLDOWN_DAYS: Record<RejectionKind, number | null> = {
  OUT_OF_SCOPE: 90,   // "a 7-Eleven is not a destination" — won't change
  FIXABLE: null,      // "coordinates are in the ocean" — please fix and resend
  DUPLICATE: 90,      // already on the map
  ABUSE: 365,         // bad faith — also consider UserStatus.SUSPENDED
};

// VerificationRequest — scope is PER USER.
// Unlike locations, the claim here is about identity, and identity doesn't
// change in a week. This queue is worked by an ADMIN personally, so noise is
// expensive.
const VERIFICATION_COOLDOWN_DAYS: Record<RejectionKind, number | null> = {
  OUT_OF_SCOPE: 180,  // "we verify organisations, not individuals"
  FIXABLE: null,      // "send letterhead, not a screenshot" — we want it back
  DUPLICATE: 90,
  ABUSE: 365,         // impersonation attempt — consider suspension
};

export function locationCooldownUntil(
  kind: RejectionKind,
  now: Date = new Date(),
): Date | null {
  const days = LOCATION_COOLDOWN_DAYS[kind];
  return days === null ? null : new Date(now.getTime() + days * DAY_MS);
}

export function verificationCooldownUntil(
  kind: RejectionKind,
  now: Date = new Date(),
): Date | null {
  const days = VERIFICATION_COOLDOWN_DAYS[kind];
  return days === null ? null : new Date(now.getTime() + days * DAY_MS);
}

// True when a cooldown is still running. Null/past = free to resubmit.
export function isCoolingDown(
  cooldownUntil: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return cooldownUntil != null && cooldownUntil > now;
}

// Rejection is a REQUIRED reason plus a kind. The prose is what the contributor
// reads; the kind is what the system branches on. Never let one stand in for
// the other — a free-text reason can't drive a cooldown, and an enum can't
// explain anything to a human.
export const RejectSchema = z.object({
  kind: z.enum(["OUT_OF_SCOPE", "FIXABLE", "DUPLICATE", "ABUSE"]),
  reason: z.string().trim().min(10).max(500),
});

// --- Telling the contributor ---
//
// A cooldown the user discovers by being blocked is a bad cooldown. On
// rejection, say what was wrong AND when (or whether) they can try again:
//
//   FIXABLE      → "Coordinates look wrong — fix and resubmit any time."
//   OUT_OF_SCOPE → "Cafes aren't destinations. You can submit a different
//                   place any time; this one can be reproposed after 90 days."
//
// The second half of that sentence is the important one. Without it, a person
// whose first submission was rejected concludes they're banned and leaves.
