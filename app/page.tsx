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
    },
  });

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
            {locations.map((loc, i) => (
              <li key={loc.id}>
                <Link
                  href={`/location/${loc.slug}`}
                  className="group flex flex-col gap-2 border-b border-[var(--border)] py-8 transition-colors sm:flex-row sm:items-baseline sm:gap-8"
                >
                  {/* Left rail: index number + specimen locality label. The
                      numbering is real here — an ordered index of entries. */}
                  <div className="flex shrink-0 items-baseline gap-3 sm:w-40 sm:flex-col sm:gap-1">
                    <span
                      className="text-sm tabular-nums text-[var(--ochre)]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="specimen-label">
                      {loc.suburb ? `${loc.suburb} · ` : ""}
                      {loc.state}
                    </span>
                  </div>

                  {/* Entry body */}
                  <div className="min-w-0 flex-1">
                    <h2
                      className="text-2xl text-[var(--ink)] decoration-[var(--eucalypt)] decoration-1 underline-offset-4 group-hover:underline sm:text-3xl"
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
