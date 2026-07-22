"use client";

// app/admin/moments/ReviewCard.tsx — one item in the post-publication review list.
//
// Moments publish immediately, so this card shows something that is ALREADY
// LIVE. The action is REMOVE (a takedown), not approve. Removal needs a kind +
// a real reason the contributor can read — never a silent disappearance.
//
// Shows CONTENT, not the contributor (MODERATION.md §2).

import { useState, useTransition } from "react";
import { removeMoment } from "../actions";

export type QueueMoment = {
  id: string;
  caption: string | null;
  createdAt: string;
  location: { name: string; place: string };
  media: { id: string; src: string }[];
};

const REMOVE_KINDS: { value: string; label: string; hint: string }[] = [
  { value: "OUT_OF_SCOPE", label: "Out of scope", hint: "Not right for this place / platform" },
  { value: "FIXABLE", label: "Fixable", hint: "Close — could be resubmitted corrected" },
  { value: "DUPLICATE", label: "Duplicate", hint: "Already shared here" },
  { value: "ABUSE", label: "Abuse", hint: "Bad faith / inappropriate" },
];

export function ReviewCard({ moment }: { moment: QueueMoment }) {
  const [isPending, startTransition] = useTransition();
  const [showRemove, setShowRemove] = useState(false);
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onRemove = () => {
    setError(null);
    if (!kind) return setError("Choose a reason kind.");
    if (reason.trim().length < 10)
      return setError("Give a reason of at least 10 characters — the contributor reads this.");
    startTransition(async () => {
      const res = await removeMoment(moment.id, { kind, reason });
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  if (done) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
        {moment.location.name} — removed
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-baseline justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <span className="font-medium">{moment.location.name}</span>
        <span className="text-xs uppercase tracking-wide text-neutral-400">
          {moment.location.place} ·{" "}
          {new Date(moment.createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto bg-neutral-100 p-3 dark:bg-neutral-900">
        {moment.media.map((mm) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={mm.id}
            src={mm.src}
            alt="Published photo"
            className="h-40 w-40 shrink-0 rounded object-cover"
          />
        ))}
      </div>

      {moment.caption && (
        <p className="px-5 py-4 leading-relaxed text-neutral-700 dark:text-neutral-300">
          {moment.caption}
        </p>
      )}

      {error && (
        <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!showRemove ? (
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <span className="text-xs text-neutral-400">Live</span>
          <button
            onClick={() => setShowRemove(true)}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Remove…
          </button>
        </div>
      ) : (
        <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <p className="mb-2 text-sm font-medium">Why is this being removed?</p>
          <div className="flex flex-wrap gap-2">
            {REMOVE_KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                title={k.hint}
                className={`rounded-full border px-3 py-1 text-sm ${
                  kind === k.value
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="A clear reason the contributor will read…"
            rows={3}
            className="mt-3 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={onRemove}
              disabled={isPending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? "…" : "Confirm removal"}
            </button>
            <button
              onClick={() => {
                setShowRemove(false);
                setError(null);
              }}
              disabled={isPending}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
