// app/page.tsx — home / browse, as a field-guide index.
//
// Open to everyone (UX_PATTERNS §7b). The place is the hero: names set in the
// display serif, each entry tagged with a specimen-style locality label. Calm,
// documented, deliberately unlike a social feed.

import Link from "next/link";
import { db } from "@/lib/db";

export default async function Home() {
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
      latitude: true,
      longitude: true,
      coverThumbKey: true,
      heroMediaId: true,
    },
  });

  // Resolve each place's face: a promoted COMMUNITY photo wins; the curator's
  // provisional cover holds the space until then.
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
    face: (l.heroMediaId ? heroById.get(l.heroMediaId) : null) ?? l.coverThumbKey ?? null,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20 sm:px-8">
      {/* Masthead — the promise, stated plainly, set with editorial weight. */}
      <header className="border-b border-[var(--border)] pb-10">
        <p className="specimen-label">A field guide to real places</p>
        <h1
          className="mt-4 text-5xl leading-[1.05] tracking-tight text-[var(--ink)] sm:text-6xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Australia
          <br />
          Is Beautiful
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-[var(--muted)]">
          Discover Australia through real experiences — honest photos and field
          notes from the places themselves.
        </p>
      </header>

      {/* The index of places. */}
      <section className="mt-4">
        {locations.length === 0 ? (
          <p className="py-16 text-[var(--muted)]">
            The first places are being added. Check back soon.
          </p>
        ) : (
          <ul>
            {withFace.map((loc, i) => (
              <li key={loc.id}>
                <Link
                  href={`/location/${loc.slug}`}
                  className="group flex flex-col gap-3 border-b border-[var(--border)] py-8 transition-colors sm:flex-row sm:gap-6"
                >
                  {/* The place's face */}
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
      </section>
    </main>
  );
}
