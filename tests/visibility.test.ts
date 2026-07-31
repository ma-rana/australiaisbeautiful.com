// tests/visibility.test.ts — the visibility predicates (SECURITY.md §3,
// PLAN.md Phase 2). These are the fragments every public query composes so that
// "what the public may see" is a data-layer rule in ONE place, not a UI rule
// re-remembered at each call site.
//
// A test on plain constant objects looks trivial — but that's the point. These
// objects ARE the security boundary; a well-meaning edit ("let's also show
// PENDING moments to their author on the public grid") would silently widen
// what leaks. The tests pin the exact shape so any widening is a red test and a
// conscious decision, not a quiet diff. The moment predicate carries the
// subtlest rule (approval AND owner-kept-public), so it gets the most scrutiny.

import { describe, it, expect } from "vitest";
import {
  publicLocationWhere,
  publicMomentWhere,
  publicMediaWhere,
} from "@/lib/queries/visibility";

describe("publicLocationWhere", () => {
  it("shows only APPROVED locations", () => {
    expect(publicLocationWhere).toEqual({ status: "APPROVED" });
  });

  it("does not leak by omission — status is the only key", () => {
    // If a future edit adds a key, this fails and forces a review of whether
    // the new condition widens or narrows public exposure.
    expect(Object.keys(publicLocationWhere)).toEqual(["status"]);
  });
});

describe("publicMomentWhere — the two-part rule", () => {
  it("requires BOTH moderation approval AND the owner keeping it public", () => {
    // The whole reason moments have a separate predicate from locations: a
    // moment is public only if it passed review (status) AND its owner has not
    // made it private (isPublic). Dropping either half is a leak:
    //   - drop status  → unreviewed uploads show publicly
    //   - drop isPublic → a contributor's private moment shows publicly
    expect(publicMomentWhere).toEqual({ status: "APPROVED", isPublic: true });
  });

  it("has exactly these two keys — neither half may be dropped silently", () => {
    expect(new Set(Object.keys(publicMomentWhere))).toEqual(
      new Set(["status", "isPublic"]),
    );
  });

  it("isPublic must be strictly true, not merely truthy", () => {
    // Guards against an accidental { isPublic: {} } or similar that Prisma
    // would treat very differently.
    expect(publicMomentWhere.isPublic).toBe(true);
  });
});

describe("publicMediaWhere — per-file moderation", () => {
  it("shows only APPROVED media (a moment can be approved with one bad photo pulled)", () => {
    expect(publicMediaWhere).toEqual({ status: "APPROVED" });
  });
});

describe("the predicates are immutable constants", () => {
  // They're declared `as const`; at runtime that's a frozen-in-intent object.
  // A call site must NOT be able to mutate the shared predicate (which would
  // poison every other query in the process). If these ever stop being plain
  // literals, this is the reminder to freeze them explicitly.
  it("mutating a copy does not affect the source", () => {
    const copy = { ...publicMomentWhere, isPublic: false };
    expect(copy.isPublic).toBe(false);
    expect(publicMomentWhere.isPublic).toBe(true);
  });
});
