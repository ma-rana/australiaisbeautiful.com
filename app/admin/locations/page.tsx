// app/admin/locations/page.tsx — all published places, for editing.
//
// The curator's index of the map: every approved location, with its current
// face, linking through to a full edit page.

import { db } from "@/lib/db";
import { requireCurator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminSignOut } from "../AdminSignOut";

export default async function LocationsIndex() {
  try {
    await requireCurator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-neutral-500">
            This account doesn&apos;t have curator access.
          </p>
        </main>
      );
    }
    throw e;
  }

  const locations = await db.location.findMany({
    where: { status: { in: ["APPROVED", "PENDING", "UNDER_REVIEW"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      suburb: true,
      state: true,
      status: true,
      coverThumbKey: true,
      heroMediaId: true,
      _count: { select: { moments: true } },
    },
  });

  // Resolve faces (community hero wins over curator cover).
  const heroIds = locations.map((l) => l.heroMediaId).filter((x): x is string => !!x);
  const heroes = heroIds.length
    ? await db.momentMedia.findMany({
        where: { id: { in: heroIds }, status: "APPROVED" },
        select: { id: true, thumbKey: true, mediaKey: true },
      })
    : [];
  const heroById = new Map(heroes.map((h) => [h.id, h.thumbKey ?? h.mediaKey]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Places</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {locations.length} on the map
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/requests" className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
            Requests
          </Link>
          <Link href="/moments" className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
            Moments
          </Link>
          <AdminSignOut />
        </div>
      </header>

      {locations.length === 0 ? (
        <p className="py-20 text-center text-neutral-500">
          No places yet. Approve a request to add the first.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
          {locations.map((loc) => {
            const face =
              (loc.heroMediaId ? heroById.get(loc.heroMediaId) : null) ??
              loc.coverThumbKey ??
              null;
            return (
              <li key={loc.id}>
                <Link
                  href={`/locations/${loc.id}`}
                  className="flex items-center gap-4 py-4 hover:opacity-80"
                >
                  {face ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={face} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded bg-neutral-100 text-[0.6rem] text-neutral-400 dark:bg-neutral-800">
                      no photo
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{loc.name}</p>
                    <p className="text-xs text-neutral-500">
                      {[loc.suburb, loc.state].filter(Boolean).join(", ")} ·{" "}
                      {loc._count.moments}{" "}
                      {loc._count.moments === 1 ? "moment" : "moments"}
                      {loc.status !== "APPROVED" && ` · ${loc.status.toLowerCase()}`}
                    </p>
                  </div>
                  <span className="text-sm text-neutral-400">Edit →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
