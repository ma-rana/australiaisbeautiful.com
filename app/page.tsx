// app/page.tsx — the home / browse page.
//
// Open to everyone, no account needed (the open-browse rule, UX_PATTERNS §7b).
// A server component that reads approved locations and lists them, each linking
// to its location page. v1 is a grid of places; the map is a later phase.
//
// Framed emptiness, never a blank void: if there are no locations yet, say so
// as curation-in-progress, not as absence.

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
    },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {/* The product's promise, stated plainly. The place is the point. */}
      <header>
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Australia Is Beautiful
        </h1>
        <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
          Discover Australia through real experiences.
        </p>
      </header>

      <section className="mt-12">
        {locations.length === 0 ? (
          // Empty state as curation, not absence.
          <p className="text-neutral-500">
            The first places are being added. Check back soon.
          </p>
        ) : (
          <ul className="space-y-6">
            {locations.map((loc) => (
              <li key={loc.id}>
                <Link
                  href={`/location/${loc.slug}`}
                  className="group block rounded-lg border border-neutral-200 p-5 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                >
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    {loc.suburb ? `${loc.suburb}, ` : ""}
                    {loc.state}
                  </p>
                  <h2 className="mt-1 text-xl font-medium text-neutral-900 group-hover:underline dark:text-neutral-100">
                    {loc.name}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-neutral-600 dark:text-neutral-400">
                    {loc.intro}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
