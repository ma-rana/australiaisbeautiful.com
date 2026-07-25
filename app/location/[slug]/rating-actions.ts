"use server";

// app/location/[slug]/rating-actions.ts — rate a PLACE, never a person.
//
// DESIGN (schema: Rating; CLAUDE.md):
// - Ratings belong to LOCATIONS. There is no "rate this contributor" anywhere.
// - One rating per user per location (@@unique). Rating again UPDATES yours —
//   an opinion revised after a second visit replaces the first, it doesn't
//   stack the ballot.
// - The average stays HIDDEN until ratingThreshold ratings exist
//   (Location.ratingThreshold, default 20). Three votes averaging 2.0 would
//   brand a place "bad" on almost no evidence; "needs N more ratings" is the
//   honest render until then.
// - The denormalized cache (ratingAvg/ratingCount) is recomputed FROM THE ROWS
//   in the same transaction as the write — never incremented blind, so it
//   self-heals and can't drift.
// - Rating needs an account (the gentle wall). Viewing never does.

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { consume, LIMITS } from "@/lib/rate-limit";
import { publicLocationWhere } from "@/lib/queries/visibility";
import { CreateRatingSchema } from "@/lib/schemas/moment";
import { revalidatePath } from "next/cache";

export type RateResult =
  | {
      ok: true;
      /** The score this user now has on record. */
      myScore: number;
      /** Fresh cache values, so the UI can settle without a refetch. */
      ratingAvg: number;
      ratingCount: number;
    }
  | { ok: false; error: "signin_required" | string };

export async function rateLocation(
  locationId: string,
  slug: string,
  score: number,
): Promise<RateResult> {
  const user = await getSessionUser();
  // The gentle wall: the UI shows a sign-in prompt rather than an error.
  if (!user) return { ok: false, error: "signin_required" };

  // Zod at the boundary — belt; the Postgres CHECK on Rating.score is braces.
  const parsed = CreateRatingSchema.safeParse({ locationId, score });
  if (!parsed.success) {
    return { ok: false, error: "Pick a rating from 1 to 5." };
  }

  const rl = consume(`rating:${user.id}`, LIMITS.RATING);
  if (!rl.ok) {
    return { ok: false, error: "That's a lot of ratings at once — take a breather." };
  }

  try {
    const location = await db.location.findFirst({
      where: { id: locationId, ...publicLocationWhere },
      select: { id: true },
    });
    if (!location) return { ok: false, error: "That place isn't available." };

    // Upsert the row, then recompute the cache FROM the rows — one transaction,
    // so the cache can never disagree with the ballots behind it.
    const { avg, count } = await db.$transaction(async (tx) => {
      await tx.rating.upsert({
        where: { locationId_userId: { locationId, userId: user.id } },
        create: { locationId, userId: user.id, score: parsed.data.score },
        update: { score: parsed.data.score },
      });

      const agg = await tx.rating.aggregate({
        where: { locationId },
        _avg: { score: true },
        _count: true,
      });
      const avg = agg._avg.score ?? 0;
      const count = agg._count;

      await tx.location.update({
        where: { id: locationId },
        data: { ratingAvg: avg, ratingCount: count },
      });

      return { avg, count };
    });

    revalidatePath(`/location/${slug}`);
    return { ok: true, myScore: parsed.data.score, ratingAvg: avg, ratingCount: count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Rating failed." };
  }
}
