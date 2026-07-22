"use client";

// app/admin/locations/[id]/EditLocationForm.tsx — the curator's edit surface.
//
// Three sections:
//   1. THE FACE — pick a contributed photo as hero, or upload/replace the
//      curator cover. The community photo wins when set; the cover is what
//      holds the place until one exists.
//   2. The write-up + practical details.
//   3. Position.

import { useState, useRef, useTransition } from "react";
import { updateLocation, setLocationHero } from "../actions";

const CATEGORIES = [
  "BEACH", "NATIONAL_PARK", "WATERFALL", "MOUNTAIN", "LOOKOUT", "UNIVERSITY",
  "MUSEUM", "HISTORIC_SITE", "ZOO", "CULTURAL_ATTRACTION", "SPORTING_VENUE",
  "MARKET", "HIDDEN_GEM", "OTHER",
];
const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const FACILITIES = [
  "TOILETS", "PARKING", "CAFE", "PICNIC_AREA", "WHEELCHAIR_ACCESS",
  "CAMPING", "SWIMMING", "BBQ", "DRINKING_WATER", "VISITOR_CENTRE",
];

type LocationInput = {
  id: string;
  slug: string;
  name: string;
  intro: string;
  category: string;
  state: string;
  suburb: string;
  address: string;
  latitude: number;
  longitude: number;
  coverKey: string | null;
  heroMediaId: string | null;
  details: {
    bestTimeToVisit: string;
    accessNotes: string;
    facilities: string[];
    entryFeeFree: boolean;
    entryFeeNote: string;
    warnings: string;
    traditionalOwners: string;
  };
};

export function EditLocationForm({
  location,
  candidates,
}: {
  location: LocationInput;
  candidates: { id: string; src: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(location.name);
  const [intro, setIntro] = useState(location.intro);
  const [category, setCategory] = useState(location.category);
  const [state, setState] = useState(location.state);
  const [suburb, setSuburb] = useState(location.suburb);
  const [address, setAddress] = useState(location.address);
  const [lat, setLat] = useState(String(location.latitude));
  const [lng, setLng] = useState(String(location.longitude));
  const [bestTime, setBestTime] = useState(location.details.bestTimeToVisit);
  const [accessNotes, setAccessNotes] = useState(location.details.accessNotes);
  const [facilities, setFacilities] = useState<string[]>(location.details.facilities);
  const [entryFree, setEntryFree] = useState(location.details.entryFeeFree);
  const [entryNote, setEntryNote] = useState(location.details.entryFeeNote);
  const [warnings, setWarnings] = useState(location.details.warnings);
  const [traditionalOwners, setTraditionalOwners] = useState(
    location.details.traditionalOwners,
  );

  const coverRef = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState<{ file: File; url: string } | null>(null);
  const [heroId, setHeroId] = useState<string | null>(location.heroMediaId);

  const toggleFacility = (f: string) =>
    setFacilities((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );

  const onSave = () => {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("intro", intro);
    fd.set("category", category);
    fd.set("state", state);
    fd.set("suburb", suburb);
    fd.set("address", address);
    fd.set("latitude", lat);
    fd.set("longitude", lng);
    fd.set("bestTimeToVisit", bestTime);
    fd.set("accessNotes", accessNotes);
    facilities.forEach((f) => fd.append("facilities", f));
    fd.set("entryFeeFree", String(entryFree));
    fd.set("entryFeeNote", entryNote);
    fd.set("warnings", warnings);
    fd.set("traditionalOwners", traditionalOwners);
    if (cover) fd.set("cover", cover.file);

    startTransition(async () => {
      const res = await updateLocation(location.id, fd);
      if (res.ok) {
        setSaved(true);
        setCover(null);
        // Scroll the confirmation into view so it can't be missed on a long form.
        setTimeout(
          () => document.getElementById("save-status")?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          }),
          50,
        );
        // Clear the confirmation after a while so it doesn't linger as stale.
        setTimeout(() => setSaved(false), 6000);
      } else {
        setError(res.error);
        setTimeout(
          () => document.getElementById("save-status")?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          }),
          50,
        );
      }
    });
  };

  const chooseHero = (mediaId: string | null) => {
    setError(null);
    startTransition(async () => {
      const res = await setLocationHero(location.id, mediaId);
      if (res.ok) setHeroId(mediaId);
      else setError(res.error);
    });
  };

  const input =
    "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

  return (
    <div className="mt-8 space-y-10">
      {/* 1. THE FACE */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          The place&apos;s face
        </h2>

        {candidates.length > 0 && (
          <div className="mt-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Pick a contributed photo. A real photo from someone who went there
              beats a stock cover — this is what the place should look like.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => chooseHero(c.id)}
                    disabled={isPending}
                    className={`block overflow-hidden rounded-md ring-2 transition ${
                      heroId === c.id
                        ? "ring-neutral-900 dark:ring-neutral-100"
                        : "ring-transparent hover:ring-neutral-300"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.src} alt="" className="h-20 w-28 object-cover" />
                  </button>
                </li>
              ))}
            </ul>
            {heroId && (
              <button
                onClick={() => chooseHero(null)}
                disabled={isPending}
                className="mt-2 text-xs text-neutral-500 underline-offset-4 hover:underline"
              >
                Clear — fall back to the cover image
              </button>
            )}
          </div>
        )}

        <div className="mt-5">
          <p className="text-xs text-neutral-500">
            {candidates.length > 0
              ? "Cover image (used when no contributed photo is chosen)"
              : "Cover image — holds the place until someone photographs it"}
          </p>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCover({ file: f, url: URL.createObjectURL(f) });
            }}
          />
          <div className="mt-2 flex items-center gap-3">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt="" className="h-24 w-40 rounded-md object-cover" />
            ) : location.coverKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={location.coverKey} alt="" className="h-24 w-40 rounded-md object-cover" />
            ) : (
              <div className="flex h-24 w-40 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-800">
                none
              </div>
            )}
            <button
              type="button"
              onClick={() => coverRef.current?.click()}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
            >
              {location.coverKey || cover ? "Replace" : "Upload"} cover
            </button>
            {cover && (
              <span className="text-xs text-neutral-500">Saves when you save below</span>
            )}
          </div>
        </div>
      </section>

      {/* 2. WRITE-UP + DETAILS */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          The write-up
        </h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={input} />
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={4}
          placeholder="An honest intro — what someone should know before they go."
          className={input}
        />
        <div className="flex flex-wrap gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={input + " w-auto"}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, " ").toLowerCase()}</option>
            ))}
          </select>
          <select value={state} onChange={(e) => setState(e.target.value)} className={input + " w-auto"}>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Suburb" className={input + " flex-1"} />
        </div>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className={input} />

        <div>
          <p className="mb-1 text-xs text-neutral-500">Facilities</p>
          <div className="flex flex-wrap gap-1.5">
            {FACILITIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFacility(f)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  facilities.includes(f)
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              >
                {f.replace(/_/g, " ").toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={entryFree} onChange={(e) => setEntryFree(e.target.checked)} />
            Free entry
          </label>
          <input
            value={entryNote}
            onChange={(e) => setEntryNote(e.target.value)}
            placeholder={entryFree ? "Note (optional)" : "What does it cost?"}
            className={input + " flex-1"}
          />
        </div>

        <input value={bestTime} onChange={(e) => setBestTime(e.target.value)} placeholder="Best time to visit" className={input} />
        <textarea
          value={accessNotes}
          onChange={(e) => setAccessNotes(e.target.value)}
          rows={2}
          placeholder="Access notes — parking, gates, track condition"
          className={input}
        />
        <textarea
          value={warnings}
          onChange={(e) => setWarnings(e.target.value)}
          rows={2}
          placeholder="Warnings, one per line"
          className={input}
        />
        <input
          value={traditionalOwners}
          onChange={(e) => setTraditionalOwners(e.target.value)}
          placeholder="Traditional Owners (verify before publishing)"
          className={input}
        />
      </section>

      {/* 3. POSITION */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Position
        </h2>
        <div className="mt-3 flex gap-2">
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" className={input} />
          <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" className={input} />
        </div>
      </section>

      {/* Save status — a proper banner, scrolled into view, not a whisper. */}
      <div id="save-status" className="space-y-3">
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/30">
            <span className="mt-0.5 text-lg leading-none text-red-600 dark:text-red-400">
              ✕
            </span>
            <div>
              <p className="font-medium text-red-800 dark:text-red-300">
                Couldn&apos;t save
              </p>
              <p className="mt-0.5 text-sm text-red-700 dark:text-red-300/90">
                {error}
              </p>
            </div>
          </div>
        )}

        {saved && (
          <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 dark:border-green-900/60 dark:bg-green-950/30">
            <span className="mt-0.5 text-lg leading-none text-green-700 dark:text-green-400">
              ✓
            </span>
            <div>
              <p className="font-medium text-green-800 dark:text-green-300">
                Changes saved
              </p>
              <p className="mt-0.5 text-sm text-green-700 dark:text-green-300/90">
                This place is updated and live.{" "}
                <a
                  href={`/location/${location.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  View the page ↗
                </a>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky save bar — always reachable on a long form. */}
      <div className="sticky bottom-0 -mx-6 border-t border-neutral-200 bg-[var(--background)]/95 px-6 py-4 backdrop-blur dark:border-neutral-800">
        <button
          onClick={onSave}
          disabled={isPending}
          className="w-full rounded-md bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
