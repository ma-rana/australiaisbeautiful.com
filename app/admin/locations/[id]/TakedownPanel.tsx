"use client";

// app/admin/locations/[id]/TakedownPanel.tsx — removing a place, by role.
//
// CURATOR sees "Request takedown" — they explain why, an admin decides.
// ADMIN sees "Archive this place" — they act directly.
//
// Archiving preserves every contributed moment; it just takes the place off the
// map. That's why it's the default action rather than delete: the photos and
// field notes belong to people who did nothing wrong.

import { useState, useTransition } from "react";
import {
  requestLocationTakedown,
  archiveLocation,
  restoreLocation,
  deleteLocationPermanently,
} from "../takedown-actions";

export function TakedownPanel({
  locationId,
  isAdmin,
  status,
  momentCount,
  hasOpenRequest,
}: {
  locationId: string;
  isAdmin: boolean;
  status: string;
  momentCount: number;
  hasOpenRequest: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmHardDelete, setConfirmHardDelete] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setDone(msg);
        setOpen(false);
      } else setError(res.error ?? "Failed");
    });
  };

  if (done) {
    return (
      <section className="rounded-lg border border-[var(--border)] px-5 py-4">
        <p className="text-sm text-[var(--ink)]">{done}</p>
      </section>
    );
  }

  // Archived places: admins can restore.
  if (status === "ARCHIVED") {
    return (
      <section className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-800/60 dark:bg-amber-950/30">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          This place is archived
        </p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
          It&apos;s off the map. Its {momentCount}{" "}
          {momentCount === 1 ? "contribution is" : "contributions are"} preserved.
        </p>
        {isAdmin && (
          <button
            onClick={() => run(() => restoreLocation(locationId), "Restored — back on the map.")}
            disabled={isPending}
            className="mt-3 rounded-md border border-amber-400 px-3 py-1.5 text-sm text-amber-900 disabled:opacity-50 dark:text-amber-200"
          >
            {isPending ? "…" : "Put back on the map"}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--border)] px-5 py-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Remove from the map
      </h2>

      {hasOpenRequest && (
        <p className="mt-2 rounded-md bg-[var(--paper-2)] px-3 py-2 text-sm text-[var(--muted)]">
          A takedown request for this place is already with an admin.
        </p>
      )}

      {!open ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            disabled={hasOpenRequest}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-red-600 disabled:opacity-50 dark:text-red-400"
          >
            {isAdmin ? "Archive this place…" : "Request takedown…"}
          </button>
          <span className="text-xs text-[var(--muted)]">
            {isAdmin
              ? `Takes it off the map. Its ${momentCount} ${momentCount === 1 ? "contribution stays" : "contributions stay"} intact.`
              : "An admin reviews the request and decides."}
          </span>
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={
              isAdmin
                ? "Why is this coming off the map?"
                : "Why should this place be taken down? An admin reads this."
            }
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() =>
                isAdmin
                  ? run(
                      () => archiveLocation(locationId, reason),
                      "Archived — this place is off the map.",
                    )
                  : run(
                      () => requestLocationTakedown(locationId, reason),
                      "Request sent — an admin will decide.",
                    )
              }
              disabled={isPending}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {isPending ? "…" : isAdmin ? "Archive" : "Send request"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Hard delete — admin only, and only when nothing is riding on it. */}
      {isAdmin && momentCount === 0 && !open && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          {confirmHardDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[var(--muted)]">
                Delete permanently? This can&apos;t be undone.
              </span>
              <button
                onClick={() =>
                  run(
                    () => deleteLocationPermanently(locationId),
                    "Deleted permanently.",
                  )
                }
                disabled={isPending}
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {isPending ? "…" : "Delete forever"}
              </button>
              <button
                onClick={() => setConfirmHardDelete(false)}
                className="text-sm text-[var(--muted)] underline-offset-4 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmHardDelete(true)}
              className="text-xs text-[var(--muted)] underline-offset-4 hover:underline"
            >
              Delete permanently (no contributions on this place)
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
