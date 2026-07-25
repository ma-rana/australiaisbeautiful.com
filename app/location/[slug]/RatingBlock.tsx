"use client";

// app/location/[slug]/RatingBlock.tsx — the place's rating, field-guide style.
//
// Two jobs, kept visually quiet (the rating is a margin note, not a scoreboard):
//   1. RENDER the community view — the average once ratingThreshold is met,
//      otherwise the honest "needs N more" line (UX: never show a 2-vote 5.0).
//   2. COLLECT this visitor's rating — five stars, tap to set, tap again to
//      revise. Signed-out visitors see the stars; tapping shows the gentle wall
//      (a sign-in link), not an error.
//
// State settles from the server action's return values — no refetch, and the
// threshold rule is applied to the FRESH count so the average appears the
// moment the twentieth rating lands.

import { useState, useTransition } from "react";
import Link from "next/link";
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

  const shown = hover ?? myScore ?? 0;
  const revealed = count >= threshold;

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-[var(--border)]/60 pb-4">
      {/* The community's view — or the honest placeholder. */}
      <div>
        <span className="specimen-label">Rating</span>{" "}
        {revealed ? (
          <span className="ml-2 text-[var(--ink)]">
            <span className="font-medium">{avg.toFixed(1)}</span>
            <span className="text-[var(--foreground)]/60"> / 5 · {count} ratings</span>
          </span>
        ) : (
          <span className="ml-2 text-sm text-[var(--foreground)]/60">
            {count === 0
              ? "Not yet rated"
              : `Rated by ${count} explorer${count === 1 ? "" : "s"}`}
            {" — shows at "}
            {threshold}
          </span>
        )}
      </div>

      {/* This visitor's ballot. */}
      <div className="flex items-center gap-2" onMouseLeave={() => setHover(null)}>
        <span className="specimen-label">{myScore ? "Your rating" : "Rate it"}</span>
        <div className="flex" role="radiogroup" aria-label="Rate this place from 1 to 5">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={myScore === s}
              aria-label={`${s} star${s === 1 ? "" : "s"}`}
              disabled={isPending}
              onMouseEnter={() => setHover(s)}
              onFocus={() => setHover(s)}
              onClick={() => rate(s)}
              className={`px-0.5 text-xl leading-none transition-colors disabled:opacity-50 ${
                s <= shown
                  ? "text-[var(--ochre)]"
                  : "text-[var(--foreground)]/25 hover:text-[var(--ochre)]/60"
              }`}
            >
              {s <= shown ? "★" : "☆"}
            </button>
          ))}
        </div>
      </div>

      {/* The gentle wall / errors — full-width beneath the row. */}
      {wall && !signedIn && (
        <p className="w-full text-sm text-[var(--foreground)]/70">
          <Link
            href={`/signin?callbackUrl=/location/${slug}`}
            className="text-[var(--eucalypt)] underline underline-offset-4"
          >
            Sign in
          </Link>{" "}
          to rate this place.
        </p>
      )}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
