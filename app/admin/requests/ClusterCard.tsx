"use client";

// app/admin/requests/ClusterCard.tsx — one requested place awaiting a decision.
//
// Shows the demand count and every request's note, because the notes are the
// signal worth reading. Approving means WRITING the place properly (name, intro,
// category, state) — the request's name is a pointer, not final copy. Rejecting
// needs a kind + reason, which future requesters see instantly.

import { useState, useTransition, useRef } from "react";
import { approveCluster, rejectCluster } from "./actions";

export type QueueCluster = {
  id: string;
  displayName: string;
  latitude: number;
  longitude: number;
  requestCount: number;
  requests: { id: string; name: string; note: string | null; createdAt: string }[];
};

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

const REJECT_KINDS = [
  { value: "OUT_OF_SCOPE", label: "Out of scope" },
  { value: "FIXABLE", label: "Fixable" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "ABUSE", label: "Abuse" },
];

export function ClusterCard({ cluster }: { cluster: QueueCluster }) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  // Approve form — the curator writes the real place.
  const [name, setName] = useState(cluster.displayName);
  const [intro, setIntro] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [state, setState] = useState("VIC");
  const [suburb, setSuburb] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState(String(cluster.latitude));
  const [lng, setLng] = useState(String(cluster.longitude));
  const [bestTime, setBestTime] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [facilities, setFacilities] = useState<string[]>([]);
  const [entryFree, setEntryFree] = useState(true);
  const [entryNote, setEntryNote] = useState("");
  const [warnings, setWarnings] = useState("");
  const [traditionalOwners, setTraditionalOwners] = useState("");

  // Cover image — the place's provisional face until a community photo is
  // promoted to hero. Without one, a newly published place is a blank card.
  const coverRef = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState<{ file: File; url: string } | null>(null);

  const toggleFacility = (f: string) =>
    setFacilities((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );

  // Reject form
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");

  const onApprove = () => {
    setError(null);
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
      const res = await approveCluster(cluster.id, fd);
      if (res.ok) setDone("approved");
      else setError(res.error);
    });
  };

  const onReject = () => {
    setError(null);
    if (!kind) return setError("Choose a reason kind.");
    if (reason.trim().length < 10) return setError("Give a reason of at least 10 characters.");
    startTransition(async () => {
      const res = await rejectCluster(cluster.id, { kind, reason });
      if (res.ok) setDone("rejected");
      else setError(res.error);
    });
  };

  if (done) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
        {cluster.displayName} — {done === "approved" ? "added to the map ✓" : "declined"}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-baseline justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <span className="font-medium">{cluster.displayName}</span>
        <span className="text-xs text-neutral-400">
          {cluster.requestCount} {cluster.requestCount === 1 ? "request" : "requests"} ·{" "}
          {Math.abs(cluster.latitude).toFixed(3)}°{cluster.latitude >= 0 ? "N" : "S"}{" "}
          {Math.abs(cluster.longitude).toFixed(3)}°{cluster.longitude >= 0 ? "E" : "W"}
        </span>
      </div>

      {/* The notes — the real signal */}
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {cluster.requests.map((r) => (
          <li key={r.id} className="px-5 py-3">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              &ldquo;{r.name}&rdquo;
            </p>
            {r.note && (
              <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {r.note}
              </p>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {mode === "idle" && (
        <div className="flex gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <button
            onClick={() => setMode("approve")}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Add to the map…
          </button>
          <button
            onClick={() => setMode("reject")}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Decline…
          </button>
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-4 border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <p className="text-sm font-medium">Write the place properly</p>

          {/* COVER IMAGE — the place's face. Provisional: once a real
              contribution arrives and gets promoted to hero, that community
              photo takes over. But without this, a new place is a blank card. */}
          <div>
            <p className="mb-1 text-xs text-neutral-500">
              Cover image — holds the place until someone photographs it
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
            {cover ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.url}
                  alt="Cover preview"
                  className="h-32 w-56 rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(cover.url);
                    setCover(null);
                  }}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-sm text-white hover:bg-black"
                  aria-label="Remove cover"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                className="h-32 w-56 rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-neutral-400 dark:border-neutral-700"
              >
                Choose a cover photo
              </button>
            )}
          </div>

          {/* Core */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={3}
            placeholder="An honest intro — what someone should know before they go. This is the page's voice, so write it properly."
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />

          <div className="flex flex-wrap gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-neutral-300 bg-transparent px-2 py-2 text-sm dark:border-neutral-700"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ").toLowerCase()}</option>
              ))}
            </select>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="rounded-md border border-neutral-300 bg-transparent px-2 py-2 text-sm dark:border-neutral-700"
            >
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              placeholder="Suburb"
              className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
          </div>

          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address (as you'd tell someone how to find it)"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />

          {/* Coordinates — the cluster centroid is an average of requester pins,
              so the curator places it properly. */}
          <div>
            <p className="mb-1 text-xs text-neutral-500">
              Position (from requests — adjust to the real spot)
            </p>
            <div className="flex gap-2">
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Latitude"
                className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              />
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="Longitude"
                className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              />
            </div>
          </div>

          {/* Practical details — the stuff that makes a page useful */}
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
              <input
                type="checkbox"
                checked={entryFree}
                onChange={(e) => setEntryFree(e.target.checked)}
              />
              Free entry
            </label>
            <input
              value={entryNote}
              onChange={(e) => setEntryNote(e.target.value)}
              placeholder={entryFree ? "Note (optional)" : "What does it cost?"}
              className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
          </div>

          <input
            value={bestTime}
            onChange={(e) => setBestTime(e.target.value)}
            placeholder="Best time to visit"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />

          <textarea
            value={accessNotes}
            onChange={(e) => setAccessNotes(e.target.value)}
            rows={2}
            placeholder="Access notes — parking, gates, track condition, how to actually get in"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />

          <textarea
            value={warnings}
            onChange={(e) => setWarnings(e.target.value)}
            rows={2}
            placeholder="Warnings, one per line — rips, crocodiles, bushfire season, seasonal closures"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />

          <input
            value={traditionalOwners}
            onChange={(e) => setTraditionalOwners(e.target.value)}
            placeholder="Traditional Owners (verify before publishing)"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />

          <div className="flex gap-2 pt-1">
            <button
              onClick={onApprove}
              disabled={isPending}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {isPending ? "…" : "Publish this place"}
            </button>
            <button
              onClick={() => setMode("idle")}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <p className="mb-2 text-sm font-medium">
            Why not? (future requesters see this)
          </p>
          <div className="flex flex-wrap gap-2">
            {REJECT_KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
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
            rows={3}
            placeholder="e.g. Cafes aren't destinations on this map — it's for places worth a trip."
            className="mt-3 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={onReject}
              disabled={isPending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending ? "…" : "Decline — decision sticks"}
            </button>
            <button
              onClick={() => setMode("idle")}
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
