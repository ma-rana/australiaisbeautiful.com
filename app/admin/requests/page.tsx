// app/admin/requests/page.tsx — the location request queue.
//
// The CLUSTER is the reviewable unit, ordered by DEMAND (requestCount desc):
// the most-wanted places float to the top. Demand sets priority, never the
// decision — a much-requested cafe still fails the rubric.
//
// Each cluster shows every request behind it: the names people used and, more
// importantly, WHY they want it. Those notes are the real signal.
//
// Gated by requireCurator() — approving locations is a curator's job.

import { db } from "@/lib/db";
import { requireCurator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClusterCard, type QueueCluster } from "./ClusterCard";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";

export default async function RequestQueue() {
  try {
    await requireCurator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;

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
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/requests"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Requested places"
      subtitle="Most-wanted first. Demand sets the order, not the decision."
    >
      {queue.length === 0 ? (
        <div className="admin-panel px-5 py-12 text-center">
          <p className="text-sm font-medium">No open requests</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Suggestions from explorers appear here, grouped by place.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {queue.map((c) => (
            <li key={c.id}>
              <ClusterCard cluster={c} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
