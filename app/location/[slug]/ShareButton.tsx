"use client";

// app/location/[slug]/ShareButton.tsx — the quiet share affordance (§7i).
//
// The URL is the share: sharing is the product's ONLY organic growth channel,
// and what's shared is always the LOCATION link — never a moment, never a
// photo (UX_PATTERNS §7i). This button hands that link on:
//   - Mobile / share-sheet browsers → navigator.share, the native sheet, with
//     the place name as the title so messaging apps show something human.
//   - Everywhere else → copy to clipboard, with a brief "Link copied"
//     confirmation swapped into the label (no toast layer to build or
//     maintain; the button confirms itself).
//
// Posture per spec: available, not insistent. It sits beside Directions as a
// secondary action and never nags — no share-to-unlock, no prompts.

import { useRef, useState } from "react";
import { Share } from "@/components/icons";

export function ShareButton({ slug, name }: { slug: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const share = async () => {
    // Built at click time from the real origin, so dev, preview, and prod all
    // share the URL the visitor is actually on — and it's always the location's
    // canonical path (§7i: share the place, never a moment param).
    const url = `${window.location.origin}/location/${slug}`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: name, url });
        return; // the native sheet handled it
      } catch (e) {
        // The user closing the sheet is not an error — do nothing.
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Anything else (rare share() failures) falls through to copy.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied (permissions, insecure context). Last resort:
      // the prompt box — ugly but universal, and the user still gets the link.
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className="btn btn-secondary btn-sm"
      aria-label={`Share ${name}`}
    >
      <Share size={15} />
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
