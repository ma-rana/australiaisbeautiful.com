"use client";

// app/contributions/MomentRow.tsx — one of your contributions, with controls.
//
// What you can do with your own moment:
//   - Edit the field note (the photos are fixed once processed; the note is the
//     actual product and should be correctable)
//   - Hide it / show it (your own privacy control, independent of moderation)
//   - Delete it permanently (rows AND files — a real withdrawal, not a hide)
//
// If it was removed by a moderator, the reason is shown plainly. A removal the
// contributor can't see the reason for is just a disappearance.

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  setMomentVisibility,
  updateMomentCaption,
  deleteMoment,
} from "./actions";

export type OwnMoment = {
  id: string;
  caption: string | null;
  status: string;
  isPublic: boolean;
  reactionCount: number;
  createdAt: string;
  rejectionReason: string | null;
  location: { name: string; slug: string; place: string };
  media: { id: string; src: string }[];
};

export function MomentRow({ moment }: { moment: OwnMoment }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(moment.caption ?? "");
  const [isPublic, setIsPublic] = useState(moment.isPublic);

  const removed = moment.status === "REMOVED" || moment.status === "REJECTED";

  const onToggleVisibility = () => {
    setError(null);
    const next = !isPublic;
    setIsPublic(next); // optimistic
    startTransition(async () => {
      const res = await setMomentVisibility(moment.id, next);
      if (!res.ok) {
        setIsPublic(!next);
        setError(res.error);
      }
    });
  };

  const onSaveCaption = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateMomentCaption(moment.id, caption);
      if (res.ok) setEditing(false);
      else setError(res.error);
    });
  };

  const onDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteMoment(moment.id);
      if (res.ok) setDeleted(true);
      else setError(res.error);
    });
  };

  if (deleted) {
    return (
      <div className="rounded-lg border border-[var(--border)] px-5 py-4 text-sm text-[var(--muted)]">
        Deleted — your photos and note have been removed.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      {/* Which place, and its state */}
      <div className="flex items-baseline justify-between border-b border-[var(--border)] px-5 py-3">
        <Link
          href={`/location/${moment.location.slug}`}
          className="font-medium text-[var(--ink)] underline-offset-4 hover:underline"
        >
          {moment.location.name}
        </Link>
        <span className="specimen-label">
          {removed
            ? "Removed"
            : !isPublic
              ? "Hidden by you"
              : "Live"}
        </span>
      </div>

      {/* A moderator removed it — say why, plainly. */}
      {removed && moment.rejectionReason && (
        <div className="border-b border-[var(--border)] bg-[var(--paper-2)] px-5 py-3 text-sm">
          <p className="font-medium text-[var(--ink)]">Why this was removed</p>
          <p className="mt-1 text-[var(--muted)]">{moment.rejectionReason}</p>
        </div>
      )}

      {/* Photos */}
      <div className="flex gap-2 overflow-x-auto bg-[var(--paper-2)] p-3">
        {moment.media.map((mm) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={mm.id}
            src={mm.src}
            alt=""
            className={`h-28 w-28 shrink-0 rounded object-cover ${
              removed || !isPublic ? "opacity-50" : ""
            }`}
          />
        ))}
      </div>

      {/* The field note */}
      <div className="px-5 py-4">
        {editing ? (
          <>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={onSaveCaption}
                disabled={isPending}
                className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save note"}
              </button>
              <button
                onClick={() => {
                  setCaption(moment.caption ?? "");
                  setEditing(false);
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {caption ? (
              <p className="leading-relaxed text-[var(--ink)]">{caption}</p>
            ) : (
              <p className="text-sm italic text-[var(--muted)]">
                No note — add one so people know what to expect.
              </p>
            )}
            <p className="specimen-label mt-3">
              {new Date(moment.createdAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {moment.reactionCount > 0 &&
                `   ·   ${moment.reactionCount} found this a good spot`}
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Controls */}
      {!removed && !editing && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Edit note
          </button>
          <button
            onClick={onToggleVisibility}
            disabled={isPending}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {isPublic ? "Hide from the place" : "Show again"}
          </button>

          {confirmDelete ? (
            <span className="flex items-center gap-2">
              <button
                onClick={onDelete}
                disabled={isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-[var(--muted)] underline-offset-4 hover:underline"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-red-600 dark:text-red-400"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
