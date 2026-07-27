"use client";

// app/location/[slug]/RatingBlock.tsx — the place's rating, one clean row.
//
// Sits right under the title (the familiar spot: Google, Airbnb, Yelp all put
// it there). One row, no labels: the community score on the left, the visitor's
// five stars on the right. It does two jobs at once —
//   1. SHOW the community average once the threshold is met (never a 2-vote 5.0
//      headline; below the bar we show only the honest count).
//   2. COLLECT this visitor's rating — tap to set, tap again to revise.
// Signed-out visitors see the stars; tapping shows the gentle sign-in wall.
//
// State settles from the server action's return values — no refetch — so the
// score, count, and average all move the moment a rating lands.

import { useState, useTransition } from "react";
import Link from "next/link";
import { Star } from "@/components/icons";
import { rateLocation } from "./rating-actions";

export function RatingBlock({
  locationId,
  slug,
  signedIn,
  initialAvg,
  initialCount,
  threshold,
  initialMyScore,
}: {
  locationId: string;
  slug: string;
  signedIn: boolean;
  initialAvg: number;
  initialCount: number;
  threshold: number;
  initialMyScore: number | null;
}) {
  const [avg, setAvg] = useState(initialAvg);
  const [count, setCount] = useState(initialCount);
  const [myScore, setMyScore] = useState<number | null>(initialMyScore);
  const [hover, setHover] = useState<number | null>(null);
  const [wall, setWall] = useState(false); // the gentle sign-in wall
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rate = (score: number) => {
    setError(null);
    if (!signedIn) {
      setWall(true);
      return;
    }
    startTransition(async () => {
      const res = await rateLocation(locationId, slug, score);
      if (!res.ok) {
        if (res.error === "signin_required") setWall(true);
        else setError(res.error);
        return;
      }
      setMyScore(res.myScore);
      setAvg(res.ratingAvg);
      setCount(res.ratingCount);
    });
  };

  // Hover previews without erasing the committed rating: stars inside both the
  // committed score and the hover stay full ochre; stars in only one of them
  // (the gain or the drop you're previewing) go lighter; the rest are quiet.
  const committed = myScore ?? 0;
  const previewing = hover !== null;
  const solidTo = previewing ? Math.min(hover, committed) : committed;
  const lightTo = previewing ? Math.max(hover, committed) : committed;
  const revealed = count >= threshold;

  return (
    // A CLUSTER, not a section: this renders as the left half of the page's
    // meta row (page.tsx pairs it with Directions/Share on the right), so it
    // brings no outer margin of its own and flexes to the space it's given.
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      {/* LEFT — the community score, Airbnb-compact: one star glyph, the
          number, the count. No second star-row here — the five stars on this
          page exist ONCE, on the right, and they're the ones you can touch. */}
      {revealed ? (
        <div className="flex items-baseline gap-1.5">
          <Star size={15} filled className="self-center text-[var(--ochre)]" />
          <span
            className="text-lg leading-none text-[var(--ink)] tabular-nums"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {avg.toFixed(1)}
          </span>
          <span className="text-sm text-[var(--foreground)]/50">({count})</span>
        </div>
      ) : (
        <span className="text-sm text-[var(--foreground)]/50">
          {count === 0
            ? "Not yet rated"
            : `${count} rating${count === 1 ? "" : "s"}`}
        </span>
      )}

      {/* A hairline divider between the community read-out and your ballot,
          so the two halves read as related but distinct. Hidden when wrapped. */}
      <span
        className="hidden h-4 w-px bg-[var(--border)] sm:block"
        aria-hidden
      />

      {/* RIGHT — your ballot. No label; the interactivity is the invitation. */}
      <div
        className="flex items-center"
        onMouseLeave={() => setHover(null)}
      >
        <div
          className="flex -mx-1"
          role="radiogroup"
          aria-label="Rate this place from 1 to 5"
        >
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={committed === s}
              aria-label={`${s} star${s === 1 ? "" : "s"}`}
              disabled={isPending}
              onMouseEnter={() => setHover(s)}
              onFocus={() => setHover(s)}
              onClick={() => rate(s)}
              className={`cursor-pointer rounded-md p-1 leading-none transition-[color,transform] duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ochre)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
                s <= solidTo
                  ? "text-[var(--ochre)]"
                  : s <= lightTo
                    ? "text-[var(--ochre)]/55"
                    : "text-[var(--foreground)]/25 hover:text-[var(--ochre)]/40"
              }`}
            >
              <Star size={20} filled={s <= lightTo} />
            </button>
          ))}
        </div>
        {myScore && !previewing && (
          <span className="ml-2 text-sm text-[var(--foreground)]/45">
            Your rating
          </span>
        )}
      </div>

      {/* The gentle wall / errors — appears on its own line beneath the
          cluster. Rendered only when there IS a message: inside a shared row,
          a permanently reserved slot would push the vertical centring off
          against the buttons beside it. aria-live still announces changes. */}
      <div aria-live="polite" className="w-full empty:hidden">
        {wall && !signedIn && (
          <p className="text-sm text-[var(--foreground)]/70">
            <Link
              href={`/signin?callbackUrl=/location/${slug}`}
              className="text-[var(--eucalypt)] underline underline-offset-4"
            >
              Sign in
            </Link>{" "}
            to rate this place.
          </p>
        )}
        {error && <p className="text-sm text-[var(--ochre)]">{error}</p>}
      </div>
    </div>
  );
}
