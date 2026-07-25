"use client";

// app/request/RequestForm.tsx — the suggest-a-place form.
//
// Asks for: the name, where it is (a pin on a map — see LocationPicker), and
// WHY. The why is the real signal: "been here twice, the north track is the
// good one" is self-evidently from someone who's actually been, which is worth
// more than any verification could be.
//
// Honest outcomes (UX): the response tells the requester the truth immediately —
// queued, already on the map, or previously declined (with the reason). Nobody
// submits into a void, and nobody re-submits a place that's already been ruled
// out.

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { FIELD, LABEL, PRIMARY } from "@/components/AuthShell";
import type { PickedPoint } from "./LocationPicker";
import { submitLocationRequest, type RequestResult } from "./actions";

// MapLibre touches `window` at IMPORT time — the exact reason MapShell exists
// for the homepage map. A static import here evaluates maplibre-gl during the
// server render of /request and the canvas comes up dead. The type import
// above is safe (types are erased); the component itself must load client-only.
const LocationPicker = dynamic(
  () => import("./LocationPicker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="mt-2 flex h-72 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--paper-2)]">
        <p className="specimen-label">Loading the map…</p>
      </div>
    ),
  },
);

export function RequestForm() {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [point, setPoint] = useState<PickedPoint | null>(null);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = () => {
    setResult(null);
    if (!name.trim()) {
      setResult({ ok: false, error: "What's the place called?" });
      return;
    }
    if (!point) {
      setResult({
        ok: false,
        error:
          "Where is it? Use your location, then drag the map until the pin is on the spot.",
      });
      return;
    }
    // ON-SITE REQUIRED (product decision, 2026-07-25): suggestions must be
    // made from at or near the place — the pin has to sit inside the on-site
    // zone. Known trade-offs, accepted deliberately: geolocation is
    // client-claimed so this deters casual armchair pins rather than defeating
    // a determined spoofer, and it excludes the suggest-from-home-later case.
    // To soften back to signal-only, delete this block — everything else
    // (zone, flag, curator display) already works without it.
    if (!point.fromMyLocation) {
      setResult({
        ok: false,
        error:
          "Suggestions are made from the place itself — tap “Use my current location” and drop the pin inside the circle. If you're not there right now, save it for your next visit.",
      });
      return;
    }
    // The why is required (see actions.ts — it's the only thing a curator can
    // judge by). Checked here too so nobody round-trips to find out.
    if (note.trim().length < 20) {
      setResult({
        ok: false,
        error: "Tell us a little more — what makes it worth the trip?",
      });
      return;
    }
    startTransition(async () => {
      const res = await submitLocationRequest({
        name,
        note,
        latitude: point.latitude,
        longitude: point.longitude,
        fromNearMe: point.fromMyLocation,
      });
      setResult(res);
      if (res.ok && res.status === "queued") {
        setName("");
        setNote("");
        setPoint(null);
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
          <p className="specimen-label text-[var(--eucalypt)]">Received</p>
          <p
            className="mt-2 text-xl text-[var(--ink)]"
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
            className="mt-4 rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
          >
            Suggest another place
          </button>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="place-name" className={LABEL}>
              What&apos;s it called?
            </label>
            <input
              id="place-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Werribee Gorge Circuit Walk"
              className={FIELD}
            />
          </div>

          {/* WHERE — a pin on the map, not a pair of numbers. */}
          <div>
            <label className={LABEL}>Where is it?</label>
            <LocationPicker value={point} onChange={setPoint} />
          </div>

          {/* The WHY — the real signal */}
          <div>
            <label htmlFor="place-note" className={LABEL}>
              Why should someone go?
            </label>
            <p className="mt-1 text-sm text-[var(--muted)]">
              At least a sentence — this is what our curators judge the
              suggestion by. What makes it worth the trip, and anything useful
              you know from being there.
            </p>
            <textarea
              id="place-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="e.g. Been twice. The north track is the good one — the south is overgrown. Best light late afternoon, and there's parking at the top gate."
              className={FIELD}
            />
          </div>

          {/* Honest outcome messaging */}
          {result && (
            <div
              className={`rounded-md border border-[var(--border)] px-4 py-3 text-sm leading-relaxed ${
                result.ok ? "text-[var(--ink)]" : "text-[var(--ochre)]"
              }`}
            >
              {result.ok ? (
                <>
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

          <button onClick={onSubmit} disabled={isPending} className={PRIMARY}>
            {isPending ? "Sending…" : "Suggest this place"}
          </button>
        </>
      )}
    </div>
  );
}
