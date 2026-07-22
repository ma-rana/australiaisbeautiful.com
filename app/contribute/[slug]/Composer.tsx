"use client";

// app/contribute/[slug]/Composer.tsx — the moment composer (UX_PATTERNS §7j).
//
// Familiar upload mechanics (select → staging preview → remove → submit), the
// one deliberate difference being the caption is a QUESTION, not a blank box —
// that's what harvests field notes instead of "great spot 😍". No filter suite
// (real photos, not stylised). Photos-only in v1.

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMoment } from "../actions";

const MAX_FILES = 10;

type Staged = { file: File; url: string };

export function Composer({ locationId, slug }: { locationId: string; slug: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setStaged((prev) => {
      const combined = [...prev, ...incoming.map((f) => ({ file: f, url: URL.createObjectURL(f) }))];
      if (combined.length > MAX_FILES) {
        setError(`Up to ${MAX_FILES} photos per moment.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  const removeAt = (i: number) => {
    setStaged((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const onSubmit = () => {
    setError(null);
    if (staged.length === 0) {
      setError("Add at least one photo.");
      return;
    }
    const fd = new FormData();
    fd.set("locationId", locationId);
    fd.set("caption", caption);
    fd.set("isPublic", "true");
    staged.forEach((s) => fd.append("files", s.file));

    startTransition(async () => {
      const res = await createMoment(fd);
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(res.error);
      }
    });
  };

  // Honest confirmation — the moment is LIVE now (moments publish immediately
  // on approved places; review happens after, not as a gate).
  if (submitted) {
    return (
      <div className="mt-8 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
          Thanks — it&apos;s live.
        </p>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Your photos and note are on the place&apos;s page now. You can edit or
          remove them any time from your contributions.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => router.push(`/location/${slug}`)}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Back to the place
          </button>
          <button
            onClick={() => {
              setStaged([]);
              setCaption("");
              setSubmitted(false);
            }}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
          >
            Add more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Select */}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-neutral-300 py-10 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:hover:border-neutral-500"
        >
          {staged.length === 0 ? "Choose photos" : "Add more photos"}
        </button>
      </div>

      {/* Staging preview — thumbnails with × remove */}
      {staged.length > 0 && (
        <ul className="grid grid-cols-3 gap-3">
          {staged.map((s, i) => (
            <li key={s.url} className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.url}
                alt={`Selected photo ${i + 1}`}
                className="h-full w-full rounded-md object-cover"
              />
              <button
                onClick={() => removeAt(i)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-sm text-white hover:bg-black"
                aria-label="Remove photo"
              >
                ✕
              </button>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[0.65rem] text-white">
                  Leads
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The field-note QUESTION — the deliberate difference from a blank box */}
      <div>
        <label className="block font-medium text-neutral-800 dark:text-neutral-200">
          What should someone know before they go?
        </label>
        <p className="mt-1 text-sm text-neutral-500">
          The honest, useful stuff — parking, the best bit, what to skip, when to
          come. This is what makes the place worth the trip.
        </p>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="e.g. Park on the side street — the main lot fills by 9. The north track has the best view and it's an easy walk."
          className="mt-3 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        onClick={onSubmit}
        disabled={isPending || staged.length === 0}
        className="w-full rounded-md bg-neutral-900 px-4 py-3 font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {isPending ? "Uploading…" : "Share"}
      </button>
    </div>
  );
}
