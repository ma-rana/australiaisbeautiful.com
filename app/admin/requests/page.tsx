// app/admin/requests/page.tsx — the location request queue.
//
// The CLUSTER is the reviewable unit, ordered by DEMAND (requestCount desc):
// the most-wanted places float to the top. Demand sets priority, never the
// decision — a much-requested cafe still fails the rubric.
//
// Each cluster shows every request behind it: the names people used and, more
// importantly, WHY they want it. Those notes are the real signal — "been twice,
// the north track is the good one" is self-evidently someone who's been there.
//
// Gated by requireCurator() — approving locations is a curator's job (it's
// editorial judgement about the map), distinct from the moment review list.

import { db } from "@/lib/db";
import { requireCurator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClusterCard, type QueueCluster } from "./ClusterCard";
import { AdminSignOut } from "../AdminSignOut";

export default async function RequestQueue() {
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

  const clusters = await db.locationRequestCluster.findMany({
    where: { status: "OPEN" },
    orderBy: [{ requestCount: "desc" }, { createdAt: "asc" }],
    include: {
      requests: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, note: true, createdAt: true },
      },
    },
  });

  const queue: QueueCluster[] = clusters.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    latitude: c.latitude,
    longitude: c.longitude,
    requestCount: c.requestCount,
    requests: c.requests.map((r) => ({
      id: r.id,
      name: r.name,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Requested places</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {queue.length} open · most-wanted first · demand sets priority, not
            the decision
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/locations"
            className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Places
          </Link>
          <Link
            href="/moments"
            className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Moments
          </Link>
          <AdminSignOut />
        </div>
      </header>

      {queue.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg font-medium">No open requests</p>
          <p className="mt-1 text-neutral-500">
            Suggestions from explorers appear here, grouped by place.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-6">
          {queue.map((c) => (
            <li key={c.id}>
              <ClusterCard cluster={c} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
