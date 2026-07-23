// app/admin/takedowns/page.tsx — takedown requests awaiting an admin.
//
// Curators can't remove a place; they request it, and an admin rules. ADMIN
// ONLY — a curator seeing requests they can't act on would just be noise.

import { db } from "@/lib/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TakedownRequestCard, type PendingTakedown } from "./TakedownRequestCard";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";

export default async function TakedownsQueue() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Only administrators rule on takedown requests.
          </p>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;

  const escalations = await db.escalation.findMany({
    where: { targetType: "LOCATION", status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    orderBy: { createdAt: "asc" },
  });

  const locationIds = escalations.map((e) => e.targetId);
  const locations = locationIds.length
    ? await db.location.findMany({
        where: { id: { in: locationIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          suburb: true,
          state: true,
          status: true,
          _count: { select: { moments: true } },
        },
      })
    : [];
  const byId = new Map(locations.map((l) => [l.id, l]));

  const pending: PendingTakedown[] = escalations.map((e) => {
    const loc = byId.get(e.targetId);
    return {
      escalationId: e.id,
      locationId: e.targetId,
      detail: e.detail,
      raisedAt: e.createdAt.toISOString(),
      location: loc
        ? {
            name: loc.name,
            slug: loc.slug,
            place: [loc.suburb, loc.state].filter(Boolean).join(", "),
            momentCount: loc._count.moments,
            status: loc.status,
          }
        : null,
    };
  });

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/takedowns"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Takedown requests"
      subtitle="Curators asking for a place to come off the map."
    >
      {pending.length === 0 ? (
        <div className="admin-panel px-5 py-12 text-center">
          <p className="text-sm font-medium">Nothing pending</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Requests appear here for your decision.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((p) => (
            <li key={p.escalationId}>
              <TakedownRequestCard request={p} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
