// app/admin/map/page.tsx — the spatial admin surface (ADMIN.md §2c).
//
// The same map of Australia the public sees, with the staff work layer on top:
// open request clusters as ochre pins beside the eucalypt dots of approved
// places. The curator reviews requests IN geographic context — the one thing
// the /requests list can't show is that a request sits on top of (or right
// beside) a place that already exists.
//
// Guard: requireCurator, first act — reviewing locations is a curator's job
// (the requireCurator-not-requireModerator split, MODERATION §1). The request
// data on this page is staff-only and must never ride a public endpoint
// (D23: admin visibility ≠ public visibility).
//
// The /requests LIST stays alive alongside this: the list wins for working the
// queue oldest/most-wanted-first; the map wins for the spatial judgement. Two
// views, one set of audited actions.

import { db } from "@/lib/db";
import { requireCurator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";
import { AdminMap, type AdminMapLocation } from "./AdminMap";
import type { QueueCluster } from "../requests/ClusterCard";

export const dynamic = "force-dynamic";

export default async function AdminMapPage() {
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
  const isModerator = ctx.role === "MODERATOR" || ctx.role === "ADMIN";
  // Requests are curation work — a moderator's map doesn't carry them (job
  // focus, mirroring the rail), so their render never fetches the clusters.
  const showRequests = ctx.role === "CURATOR" || ctx.role === "ADMIN";

  // MODERATOR layer (§2c): where new content is landing. Moments publish
  // immediately here (the gate is on places, not contributions), so the
  // signal is RECENT ACTIVITY — moments live in the last 7 days — not a
  // pending count. Role-scoped like the rail: a curator's map never queries
  // the moment table.
  const recentByLocation = new Map<string, number>();
  if (isModerator) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const grouped = await db.moment.groupBy({
      by: ["locationId"],
      where: { status: "APPROVED", createdAt: { gte: since } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      recentByLocation.set(g.locationId, g._count._all);
    }
  }

  // The context layer — every approved place, as it exists on the real map.
  const locations: AdminMapLocation[] = (
    await db.location.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, latitude: true, longitude: true },
    })
  ).map((l) => ({
    id: l.id,
    name: l.name,
    latitude: l.latitude,
    longitude: l.longitude,
    recent: recentByLocation.get(l.id) ?? 0,
  }));

  // The work layer — the same query as /requests, so both views always agree.
  const clusters = showRequests
    ? await db.locationRequestCluster.findMany({
        where: { status: "OPEN" },
        orderBy: [{ requestCount: "desc" }, { createdAt: "asc" }],
        include: {
          requests: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, note: true, createdAt: true },
          },
        },
      })
    : [];

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
      current="/map"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="The map"
      wide
      subtitle={
        ctx.role === "ADMIN"
          ? "Red pins are requested places — tap to review. Numbered green circles show where moments landed this week — tap to open that place's grid."
          : ctx.role === "MODERATOR"
            ? "Numbered green circles show where moments landed this week — tap one to open that place's grid."
            : "Red pins are requested places — tap one to review it where it is. Toggle “On the map” in the legend to see approved places."
      }
    >
      {/* The map wants the room a queue doesn't: near-viewport height, minus
          the shell's own chrome. min-h keeps it workable on short screens. */}
      <div className="h-[calc(100vh-11rem)] min-h-[480px]">
        <AdminMap locations={locations} clusters={queue} role={ctx.role} />
      </div>
    </AdminShell>
  );
}
