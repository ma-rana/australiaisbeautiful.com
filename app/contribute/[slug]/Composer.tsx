"use client";

// app/contribute/[slug]/Composer.tsx — the moment composer (UX_PATTERNS §7j).
//
// Familiar upload mechanics (select → staging preview → remove → submit), the
// one deliberate difference being the caption is a QUESTION, not a blank box —
// that's what harvests field notes instead of "great spot 😍". No filter suite
// (real photos, not stylised). Photos-only in v1.

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FIELD, LABEL, PRIMARY } from "@/components/AuthShell";
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
      <div className="mt-8 rounded-lg border border-[var(--border)] p-6">
        <p className="specimen-label text-[var(--eucalypt)]">Live</p>
        <p
          className="mt-2 text-xl text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Thanks — it&apos;s on the place&apos;s page.
        </p>
        <p className="mt-2 leading-relaxed text-[var(--muted)]">
          Your photos and note are up now, shared as an Explorer. You can edit
          or remove them any time from your contributions.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => router.push(`/location/${slug}`)}
            className="btn btn-primary"
          >
            See it on the place
          </button>
          <button
            onClick={() => {
              setStaged([]);
              setCaption("");
              setSubmitted(false);
            }}
            className="btn btn-secondary"
          >
            Add another
          </button>
          <button
            onClick={() => router.push("/contributions")}
            className="btn btn-secondary"
          >
            Your contributions
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
          className="w-full rounded-lg border-2 border-dashed border-[var(--border)] py-10 text-[var(--muted)] transition-colors hover:border-[var(--eucalypt)]/50 hover:text-[var(--ink)]"
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
                <span className="absolute bottom-1 left-1 rounded bg-[var(--eucalypt)] px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-[var(--paper)]">
                  Leads
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The field-note QUESTION — the deliberate difference from a blank box */}
      <div>
        <label htmlFor="moment-note" className={LABEL}>
          What should someone know before they go?
        </label>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The honest, useful stuff — parking, the best bit, what to skip, when
          to come. This is what makes the place worth the trip.
        </p>
        <textarea
          id="moment-note"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="e.g. Park on the side street — the main lot fills by 9. The north track has the best view and it's an easy walk."
          className={`${FIELD} mt-3`}
        />
      </div>

      {error && <p className="text-sm text-[var(--ochre)]">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={isPending || staged.length === 0}
        className={`${PRIMARY} py-3`}
      >
        {isPending ? "Uploading…" : "Share"}
      </button>
    </div>
  );
}
