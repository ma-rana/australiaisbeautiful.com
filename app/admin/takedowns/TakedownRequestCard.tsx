"use client";

// app/admin/takedowns/TakedownRequestCard.tsx — rule on one request.
//
// The admin sees what the curator said and what's riding on the place (how many
// contributions would come off the map with it), then either archives it or
// declines with a reason the curator can read.

import { useState, useTransition } from "react";
import Link from "next/link";
import { archiveLocation, dismissTakedownRequest } from "../locations/takedown-actions";

export type PendingTakedown = {
  escalationId: string;
  locationId: string;
  detail: string;
  raisedAt: string;
  location: {
    name: string;
    slug: string;
    place: string;
    momentCount: number;
    status: string;
  } | null;
};

export function TakedownRequestCard({ request }: { request: PendingTakedown }) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "archive" | "decline">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
        {request.location?.name ?? "Place"} — {done}
      </div>
    );
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setError(null);
    if (reason.trim().length < 10) {
      setError("Give a reason of at least 10 characters.");
      return;
    }
    startTransition(async () => {
      const res = await fn();
      if (res.ok) setDone(msg);
      else setError(res.error ?? "Failed");
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-baseline justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        {request.location ? (
          <Link
            href={`/locations/${request.locationId}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {request.location.name}
          </Link>
        ) : (
          <span className="font-medium text-neutral-500">
            (place no longer exists)
          </span>
        )}
        <span className="text-xs text-neutral-400">
          {request.location?.place}
          {request.location && request.location.momentCount > 0 && (
            <> · {request.location.momentCount} contributions</>
          )}
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          Curator&apos;s reason
        </p>
        <p className="mt-1 leading-relaxed text-neutral-700 dark:text-neutral-300">
          {request.detail}
        </p>

        {request.location && request.location.momentCount > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Archiving takes this place off the map.{" "}
            {request.location.momentCount}{" "}
            {request.location.momentCount === 1 ? "contribution" : "contributions"}{" "}
            will be preserved but no longer visible.
          </p>
        )}
      </div>

      {error && (
        <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {mode === "idle" ? (
        <div className="flex gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <button
            onClick={() => setMode("archive")}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
          >
            Archive the place…
          </button>
          <button
            onClick={() => setMode("decline")}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
          >
            Decline — it stays…
          </button>
        </div>
      ) : (
        <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <p className="mb-2 text-sm font-medium">
            {mode === "archive"
              ? "Why is this coming off the map?"
              : "Why is it staying? (the curator reads this)"}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() =>
                mode === "archive"
                  ? act(
                      () => archiveLocation(request.locationId, reason),
                      "archived",
                    )
                  : act(
                      () => dismissTakedownRequest(request.escalationId, reason),
                      "request declined",
                    )
              }
              disabled={isPending}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                mode === "archive" ? "bg-red-600" : "bg-neutral-900 dark:bg-neutral-700"
              }`}
            >
              {isPending ? "…" : mode === "archive" ? "Archive" : "Decline"}
            </button>
            <button
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
