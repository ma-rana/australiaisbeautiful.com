"use client";

// app/request/RequestForm.tsx — the suggest-a-place form.
//
// Asks for: the name, where it is (coords — via "use my location" or manual),
// and WHY. The why is the real signal: "been here twice, the north track is the
// good one" is self-evidently from someone who's actually been, which is worth
// more than any verification could be.
//
// Honest outcomes (UX): the response tells the requester the truth immediately —
// queued, already on the map, or previously declined (with the reason). Nobody
// submits into a void, and nobody re-submits a place that's already been ruled
// out.

import { useState, useTransition } from "react";
import { submitLocationRequest, type RequestResult } from "./actions";

export function RequestForm() {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [fromNearMe, setFromNearMe] = useState(false);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // "Use my location" — a one-off browser geolocation read to fill the pin.
  // NOT tracking: nothing is stored but the coordinates of the place being
  // suggested, and `fromNearMe` is just a flag that the pin was self-located.
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setFromNearMe(true);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const onSubmit = () => {
    setResult(null);
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!name.trim()) {
      setResult({ ok: false, error: "What's the place called?" });
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setResult({ ok: false, error: "We need the coordinates — use your location or enter them." });
      return;
    }
    startTransition(async () => {
      const res = await submitLocationRequest({
        name,
        note: note || undefined,
        latitude,
        longitude,
        fromNearMe,
      });
      setResult(res);
      if (res.ok && res.status === "queued") {
        setName("");
        setNote("");
        setLat("");
        setLng("");
        setFromNearMe(false);
      }
    });
  };

  return (
    <div className="mt-8 space-y-6">
      {/* Success state — replace the form entirely, so it's clear the thing is
          done and there's nothing left to do. Leaving a filled form on screen
          after a successful submit reads as "did that work?" */}
      {result?.ok && result.status === "queued" ? (
        <div className="rounded-lg border border-[var(--border)] p-6">
          <p
            className="text-xl text-[var(--ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Thanks — it&apos;s in.
          </p>
          <p className="mt-2 leading-relaxed text-[var(--muted)]">
            {result.message} If it makes the map, it&apos;ll appear with a proper
            write-up. If it doesn&apos;t, that&apos;s not a reflection on the
            place — just on what belongs here.
          </p>
          <button
            onClick={() => setResult(null)}
            className="mt-4 rounded-md border border-[var(--border)] px-4 py-2 text-sm"
          >
            Suggest another place
          </button>
        </div>
      ) : (
        <>
      <div>
        <label className="block font-medium text-[var(--ink)]">
          What&apos;s it called?
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Werribee Gorge Circuit Walk"
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </div>

      <div>
        <label className="block font-medium text-[var(--ink)]">Where is it?</label>
        <div className="mt-2 flex gap-2">
          <input
            value={lat}
            onChange={(e) => {
              setLat(e.target.value);
              setFromNearMe(false);
            }}
            placeholder="Latitude"
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          />
          <input
            value={lng}
            onChange={(e) => {
              setLng(e.target.value);
              setFromNearMe(false);
            }}
            placeholder="Longitude"
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          />
        </div>
        <button
          onClick={useMyLocation}
          disabled={locating}
          className="mt-2 text-sm text-[var(--eucalypt)] underline-offset-4 hover:underline disabled:opacity-50"
        >
          {locating ? "Finding you…" : "Use my current location"}
        </button>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Used once to place the pin. Nothing about your movements is stored.
        </p>
      </div>

      {/* The WHY — the real signal */}
      <div>
        <label className="block font-medium text-[var(--ink)]">
          Why should someone go?
        </label>
        <p className="mt-1 text-sm text-[var(--muted)]">
          What makes it worth the trip, and anything useful you know from being
          there.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="e.g. Been twice. The north track is the good one — the south is overgrown. Best light late afternoon, and there's parking at the top gate."
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </div>

      {/* Honest outcome messaging */}
      {result && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            result.ok
              ? "border-[var(--border)] text-[var(--ink)]"
              : "border-red-300 text-red-600 dark:text-red-400"
          }`}
        >
          {result.ok ? (
            <>
              {result.status === "queued" && <strong>Thanks — it&apos;s in. </strong>}
              {result.status === "already_exists" && (
                <strong>Already here. </strong>
              )}
              {result.status === "already_rejected" && (
                <strong>We&apos;ve looked at this one. </strong>
              )}
              {result.message}
            </>
          ) : (
            result.error
          )}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={isPending}
        className="w-full rounded-md bg-[var(--ink)] px-4 py-3 font-medium text-[var(--paper)] disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Suggest this place"}
      </button>
        </>
      )}
    </div>
  );
}
