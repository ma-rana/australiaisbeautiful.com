// app/request/page.tsx — suggest a place.
//
// The gentle wall: suggesting needs an account (viewing never does). If not
// signed in, redirect to sign-in and come back here after.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { BackToMap } from "@/components/BackToMap";
import { MapBackdropShell } from "@/components/MapBackdropShell";
import { RequestForm } from "./RequestForm";

export default async function RequestPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?callbackUrl=/request");

  return (
    <>
      {/* Contours, not the map snapshot — this page already HAS a live map
          (the picker), and a photo of a map behind a real map is double
          vision. One map per page (see MapBackdrop). */}
      <MapBackdropShell variant="contours" />
      <main className="relative mx-auto w-full max-w-xl flex-1 px-6 py-8 sm:px-8">
      {/* No SiteHeader here — this page is reached from the map's own chrome
          and carries only the way back (see SiteHeader's note). */}
      <BackToMap />

      {/* The same field-guide header block as /contributions and location
          pages: specimen eyebrow, Fraunces display line, bordered. One
          language across every content page. */}
      <header className="mt-10 border-b border-[var(--border)] pb-8">
        <p className="specimen-label text-[var(--ochre)]">
          Field submission · Made from the place itself
        </p>
        <h1
          className="mt-3 text-4xl tracking-tight text-[var(--ink)] sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Suggest a place
        </h1>
        <p className="mt-4 max-w-lg leading-relaxed text-[var(--foreground)]/85">
          Know somewhere that belongs here? Show us where it is and tell us why
          it&apos;s worth the trip. Not every suggestion becomes a place on the
          map — the bar is <span className="italic">would someone travel for
          this</span> — but every one gets read.
        </p>
      </header>
      <RequestForm />
      </main>
    </>
  );
}
