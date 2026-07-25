// app/contributions/page.tsx — your own contributions, as a private field log.
//
// PRIVATE. Only you see this. It is not a profile and never becomes one — no
// other user can view it, and there's no public equivalent (D23: everyone is an
// anonymous Explorer on the pages themselves).
//
// DESIGN: the same field-guide language as a location page — specimen-label
// eyebrow, Fraunces display line, quiet margin-note facts. The one summary
// line under the heading ("3 moments across 2 places · 14 photos") is the
// page's whole "stats" ambition: this is a logbook, not a dashboard, and
// charts about yourself are the profile-shaped thing the product refuses.

import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { BackToMap } from "@/components/BackToMap";
import { MapBackdropShell } from "@/components/MapBackdropShell";
import { MomentRow, type OwnMoment } from "./MomentRow";

export default async function ContributionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?callbackUrl=/contributions");

  const moments = await db.moment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      location: { select: { name: true, slug: true, suburb: true, state: true } },
      media: { orderBy: { position: "asc" }, select: { id: true, thumbKey: true, mediaKey: true, status: true } },
    },
  });

  const own: OwnMoment[] = moments.map((m) => ({
    id: m.id,
    caption: m.caption,
    status: m.status,
    isPublic: m.isPublic,
    reactionCount: m.reactionCount,
    createdAt: m.createdAt.toISOString(),
    rejectionReason: m.rejectionReason,
    location: {
      name: m.location.name,
      slug: m.location.slug,
      place: [m.location.suburb, m.location.state].filter(Boolean).join(", "),
    },
    media: m.media.map((mm) => ({
      id: mm.id,
      src: resolveMediaSrc(mm.thumbKey ?? mm.mediaKey) ?? "",
    })),
  }));

  // The summary line. Deliberately modest — a logbook total, not analytics.
  const placeCount = new Set(moments.map((m) => m.locationId)).size;
  const photoCount = moments.reduce((n, m) => n + m.media.length, 0);
  const worthIts = moments.reduce((n, m) => n + m.reactionCount, 0);
  const summary =
    own.length > 0
      ? [
          `${own.length} moment${own.length === 1 ? "" : "s"} across ${placeCount} place${placeCount === 1 ? "" : "s"}`,
          `${photoCount} photo${photoCount === 1 ? "" : "s"}`,
          worthIts > 0 ? `${worthIts} “worth it”` : null,
        ]
          .filter(Boolean)
          .join("   ·   ")
      : null;

  // Places you've suggested. A request row is per-cluster, so read them through
  // the requests you created... but requests have no userId in the schema, so
  // this is intentionally limited: we show clusters you can't be linked to.
  // (Left out until requests carry an author — see the note below.)

  return (
    <>
      <MapBackdropShell />
      <main className="relative mx-auto w-full max-w-2xl flex-1 px-6 py-8 sm:px-8">
      {/* No SiteHeader here — reached from the map's account menu; only the
          way back (see SiteHeader's note). */}
      <BackToMap />

      {/* Field-guide header — the same devices a location page uses. */}
      <header className="mt-10 border-b border-[var(--border)] pb-8">
        <p className="specimen-label text-[var(--ochre)]">
          Private field log&ensp;·&ensp;Only you see this
        </p>
        <h1
          className="mt-3 text-4xl tracking-tight text-[var(--ink)] sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Your contributions
        </h1>
        <p className="mt-4 max-w-lg leading-relaxed text-[var(--foreground)]/85">
          Your photos appear on the places themselves as{" "}
          <span className="italic">shared by an Explorer</span> — never under
          your name.
        </p>
        {summary && <p className="specimen-label mt-6">{summary}</p>}
      </header>

      {own.length === 0 ? (
        <div className="mt-12 rounded-lg border border-dashed border-[var(--border)] px-6 py-14 text-center">
          <p className="specimen-label">Empty logbook</p>
          <p
            className="mt-3 text-2xl text-[var(--ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Nothing shared yet
          </p>
          <p className="mx-auto mt-3 max-w-sm leading-relaxed text-[var(--muted)]">
            Been somewhere worth knowing about? Add your photos and what you
            learned — parking, timing, which track is the good one.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-md bg-[var(--eucalypt)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-90"
          >
            Find a place you know
          </Link>
        </div>
      ) : (
        <ul className="mt-10 space-y-6">
          {own.map((m) => (
            <li key={m.id}>
              <MomentRow moment={m} />
            </li>
          ))}
        </ul>
      )}
      </main>
    </>
  );
}
