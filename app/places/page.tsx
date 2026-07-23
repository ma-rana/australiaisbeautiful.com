// app/places/page.tsx — every place, as a list.
//
// The map (/) is for exploring; this is for reading. Same content, different
// question: the map answers "what's near there", the list answers "what is
// there". Both open to everyone.

import Link from "next/link";
import { db } from "@/lib/db";
import { resolveMediaSrc } from "@/lib/media/resolve";

export default async function PlacesList() {
  const locations = await db.location.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      intro: true,
      suburb: true,
      state: true,
      coverThumbKey: true,
      heroMediaId: true,
    },
  });

  const heroIds = locations.map((l) => l.heroMediaId).filter((x): x is string => !!x);
  const heroes = heroIds.length
    ? await db.momentMedia.findMany({
        where: { id: { in: heroIds }, status: "APPROVED" },
        select: { id: true, thumbKey: true, mediaKey: true },
      })
    : [];
  const heroById = new Map(heroes.map((h) => [h.id, h.thumbKey ?? h.mediaKey]));

  const withFace = locations.map((l) => ({
    ...l,
    face: resolveMediaSrc(
      (l.heroMediaId ? heroById.get(l.heroMediaId) : null) ?? l.coverThumbKey,
    ),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:px-8">
      <header className="flex items-baseline justify-between border-b border-[var(--border)] pb-6">
        <div>
          <p className="specimen-label">Every place</p>
          <h1
            className="mt-2 text-4xl leading-none tracking-tight text-[var(--ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Places
          </h1>
        </div>
        <Link
          href="/"
          className="text-sm text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
        >
          View the map
        </Link>
      </header>

      {withFace.length === 0 ? (
        <p className="py-16 text-[var(--muted)]">
          The first places are being added. Check back soon.
        </p>
      ) : (
        <ul>
          {withFace.map((loc) => (
            <li key={loc.id}>
              <Link
                href={`/location/${loc.slug}`}
                className="group flex flex-col gap-3 border-b border-[var(--border)] py-8 transition-colors sm:flex-row sm:gap-6"
              >
                {loc.face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={loc.face}
                    alt=""
                    className="h-32 w-full shrink-0 rounded-md object-cover sm:h-24 sm:w-36"
                  />
                ) : (
                  <div className="flex h-32 w-full shrink-0 items-center justify-center rounded-md bg-[var(--paper-2)] text-xs text-[var(--muted)] sm:h-24 sm:w-36">
                    No photo yet
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <span className="specimen-label">
                    {loc.suburb ? `${loc.suburb} · ` : ""}
                    {loc.state}
                  </span>
                  <h2
                    className="mt-1 text-2xl text-[var(--ink)] decoration-[var(--eucalypt)] decoration-1 underline-offset-4 group-hover:underline sm:text-3xl"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {loc.name}
                  </h2>
                  <p className="mt-2 line-clamp-2 leading-relaxed text-[var(--muted)]">
                    {loc.intro}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
