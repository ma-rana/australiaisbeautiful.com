"use client";

// app/admin/moments/ReviewCard.tsx — one item in the moderation queue.
//
// Shows the CONTENT: the photos and the field note the contributor wrote. No
// contributor identity (MODERATION.md §2). Approve is one click. Reject opens a
// reason form, because a rejection needs a kind + a real reason the contributor
// can read (§6b) — never a silent "no".

import { useState, useTransition } from "react";
import { approveMoment, rejectMoment } from "../actions";

export type QueueMoment = {
  id: string;
  caption: string | null;
  createdAt: string;
  location: { name: string; place: string };
  media: { id: string; src: string }[];
};

// The rejection kinds a moment can get, in plain language. Moments never carry a
// cooldown, so this is about telling the contributor honestly what was wrong.
const REJECT_KINDS: { value: string; label: string; hint: string }[] = [
  { value: "OUT_OF_SCOPE", label: "Out of scope", hint: "Not right for this place / platform" },
  { value: "FIXABLE", label: "Fixable", hint: "Close — needs a small change and resubmit" },
  { value: "DUPLICATE", label: "Duplicate", hint: "Already shared here" },
  { value: "ABUSE", label: "Abuse", hint: "Bad faith / inappropriate" },
];

export function ReviewCard({ moment }: { moment: QueueMoment }) {
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const onApprove = () => {
    setError(null);
    startTransition(async () => {
      const res = await approveMoment(moment.id);
      if (res.ok) setDone("approved");
      else setError(res.error);
    });
  };

  const onReject = () => {
    setError(null);
    if (!kind) return setError("Choose a reason kind.");
    if (reason.trim().length < 10)
      return setError("Give a reason of at least 10 characters — the contributor reads this.");
    startTransition(async () => {
      const res = await rejectMoment(moment.id, { kind, reason });
      if (res.ok) setDone("rejected");
      else setError(res.error);
    });
  };

  // Once decided, collapse to a quiet confirmation (it'll disappear on refresh).
  if (done) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
        {moment.location.name} — {done === "approved" ? "approved ✓" : "rejected"}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      {/* Location context */}
      <div className="flex items-baseline justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <span className="font-medium">{moment.location.name}</span>
        <span className="text-xs uppercase tracking-wide text-neutral-400">
          {moment.location.place}
        </span>
      </div>

      {/* The photos */}
      <div className="flex gap-2 overflow-x-auto bg-neutral-100 p-3 dark:bg-neutral-900">
        {moment.media.map((mm) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={mm.id}
            src={mm.src}
            alt="Submitted photo"
            className="h-40 w-40 shrink-0 rounded object-cover"
          />
        ))}
      </div>

      {/* The field note */}
      {moment.caption && (
        <p className="px-5 py-4 leading-relaxed text-neutral-700 dark:text-neutral-300">
          {moment.caption}
        </p>
      )}

      {error && (
        <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Controls */}
      {!showReject ? (
        <div className="flex gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <button
            onClick={onApprove}
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {isPending ? "…" : "Approve"}
          </button>
          <button
            onClick={() => setShowReject(true)}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Reject…
          </button>
        </div>
      ) : (
        <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <p className="mb-2 text-sm font-medium">Why is this being rejected?</p>
          <div className="flex flex-wrap gap-2">
            {REJECT_KINDS.map((k) => (
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
              onClick={onReject}
              disabled={isPending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? "…" : "Confirm rejection"}
            </button>
            <button
              onClick={() => {
                setShowReject(false);
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
