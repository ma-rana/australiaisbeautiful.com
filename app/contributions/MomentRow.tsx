"use client";

// app/contributions/MomentRow.tsx — one entry in your field log, with controls.
//
// What you can do with your own moment:
//   - Edit the field note (the photos are fixed once processed; the note is the
//     actual product and should be correctable)
//   - Hide it / show it (your own privacy control, independent of moderation)
//   - Delete it permanently (rows AND files — a real withdrawal, not a hide)
//
// If it was removed by a moderator, the reason is shown plainly. A removal the
// contributor can't see the reason for is just a disappearance.
//
// PALETTE NOTE: destructive actions use OCHRE, not red. The public site has no
// red in its system (errors on the auth pages are ochre too), and a full
// alarm-red button in this calm palette reads like a different product. The
// confirm step is what actually protects the delete; the colour just marks it.

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  setMomentVisibility,
  updateMomentCaption,
  deleteMoment,
  dismissRemovedMoment,
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

// The card's compact button vocabulary. Smaller than the global .btn system
// (these are dense inline controls, not page actions), but the SAME colours
// and behaviours: eucalypt fill for confirm, bordered secondary, ochre for the
// destructive confirm. Kept local because the size differs; the palette does
// not.
const GHOST =
  "rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink)] " +
  "transition-colors hover:border-[color-mix(in_srgb,var(--eucalypt)_50%,transparent)] " +
  "hover:bg-[color-mix(in_srgb,var(--eucalypt)_6%,transparent)] disabled:opacity-50";
const SOLID =
  "rounded-md bg-[var(--eucalypt)] px-3 py-1.5 text-sm font-medium text-[var(--paper)] " +
  "shadow-sm transition-all hover:-translate-y-px hover:shadow-md disabled:opacity-50 " +
  "disabled:hover:translate-y-0";

// Status, as a specimen tag with a coloured dot — the card's one glanceable
// signal. Eucalypt = live on the place; stone = you've hidden it; ochre = a
// moderator removed it.
function StatusTag({ removed, isPublic }: { removed: boolean; isPublic: boolean }) {
  const [dot, label] = removed
    ? ["var(--ochre)", "Removed"]
    : !isPublic
      ? ["var(--muted)", "Hidden by you"]
      : ["var(--eucalypt)", "Live"];
  return (
    <span className="specimen-label inline-flex shrink-0 items-center gap-1.5">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: dot }}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function MomentRow({ moment }: { moment: OwnMoment }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(moment.caption ?? "");
  const [isPublic, setIsPublic] = useState(moment.isPublic);
  const [dismissed, setDismissed] = useState(false);

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

  const onDismiss = () => {
    setError(null);
    startTransition(async () => {
      const res = await dismissRemovedMoment(moment.id);
      if (res.ok) setDismissed(true);
      else setError(res.error);
    });
  };

  if (dismissed) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--paper-2)] px-5 py-4 text-sm text-[var(--muted)]">
        Dismissed — cleared from your list.
      </div>
    );
  }

  if (deleted) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--paper-2)] px-5 py-4 text-sm text-[var(--muted)]">
        Deleted — your photos and note have been removed.
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--paper)]">
      {/* Which place, and this entry's state. The place leads — it's the main
          character even in your own log. */}
      <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
        <div className="min-w-0">
          <Link
            href={`/location/${moment.location.slug}`}
            className="block truncate text-[1.05rem] text-[var(--ink)] underline-offset-4 hover:underline"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {moment.location.name}
          </Link>
          {moment.location.place && (
            <p className="specimen-label mt-0.5">{moment.location.place}</p>
          )}
        </div>
        <StatusTag removed={removed} isPublic={isPublic} />
      </div>

      {/* A moderator removed it — say why, plainly, and let them clear it. */}
      {removed && (
        <>
          {moment.rejectionReason && (
            <div className="border-y border-[var(--border)] bg-[var(--paper-2)] px-5 py-3 text-sm">
              <p className="specimen-label text-[var(--ochre)]">
                Why this was removed
              </p>
              <p className="mt-1.5 leading-relaxed text-[var(--foreground)]/85">
                {moment.rejectionReason}
              </p>
            </div>
          )}
        </>
      )}

      {/* Photos — the contact sheet. */}
      <div className="flex gap-2 overflow-x-auto border-y border-[var(--border)] bg-[var(--paper-2)] p-3">
        {moment.media.map((mm) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={mm.id}
            src={mm.src}
            alt=""
            className={`h-28 w-28 shrink-0 rounded-md object-cover transition-opacity ${
              removed || !isPublic ? "opacity-45 saturate-50" : ""
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
              autoFocus
              className="w-full rounded-md border border-[var(--border)] bg-[var(--paper)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--ink)] transition-colors focus:border-[var(--eucalypt)] focus:outline-none focus:ring-2 focus:ring-[var(--eucalypt)]/20"
            />
            <div className="mt-2.5 flex items-center gap-2">
              <button onClick={onSaveCaption} disabled={isPending} className={SOLID}>
                {isPending ? "Saving…" : "Save note"}
              </button>
              <button
                onClick={() => {
                  setCaption(moment.caption ?? "");
                  setEditing(false);
                }}
                className={GHOST}
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
                No field note yet — parking, timing, which track is the good one.
              </p>
            )}
            <p className="specimen-label mt-3.5">
              {new Date(moment.createdAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {moment.reactionCount > 0 &&
                `   ·   ${moment.reactionCount} found this worth it`}
            </p>
          </>
        )}
      </div>

      {error && <p className="px-5 pb-3 text-sm text-[var(--ochre)]">{error}</p>}

      {/* Controls for a REMOVED moment: just Dismiss (clear from your list).
          No edit/hide/delete — there's nothing live to change, and the files
          are the moderator's call now, not the owner's. */}
      {removed && (
        <div className="flex items-center justify-end border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onDismiss}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            {isPending ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      )}

      {/* Controls */}
      {!removed && !editing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-5 py-3">
          <button onClick={() => setEditing(true)} className={GHOST}>
            Edit note
          </button>
          <button onClick={onToggleVisibility} disabled={isPending} className={GHOST}>
            {isPublic ? "Hide from the place" : "Show again"}
          </button>

          <span className="flex-1" />

          {confirmDelete ? (
            <span className="flex items-center gap-2.5">
              <span className="text-sm text-[var(--muted)]">
                Photos and note, gone for good?
              </span>
              <button
                onClick={onDelete}
                disabled={isPending}
                className="rounded-md bg-[var(--ochre)] px-3 py-1.5 text-sm font-medium text-[var(--paper)] shadow-sm transition-all hover:-translate-y-px hover:shadow-md disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-[var(--muted)] underline-offset-4 hover:underline"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md px-3 py-1.5 text-sm text-[var(--ochre)] transition-colors hover:bg-[var(--paper-2)]"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
}
