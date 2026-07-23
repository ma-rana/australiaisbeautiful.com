// app/admin/takedowns/page.tsx — takedown requests awaiting an admin.
//
// Curators can't remove a place; they request it, and an admin rules. This is
// that queue. ADMIN ONLY — a curator seeing (and being unable to act on) other
// curators' requests would just be noise.

import { db } from "@/lib/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav } from "../AdminNav";
import { TakedownRequestCard, type PendingTakedown } from "./TakedownRequestCard";

export default async function TakedownsQueue() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-neutral-500">
            Only administrators rule on takedown requests.
          </p>
        </main>
      );
    }
    throw e;
  }

  const escalations = await db.escalation.findMany({
    where: {
      targetType: "LOCATION",
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
    orderBy: { createdAt: "asc" },
  });

  // Pull the places these point at (targetId is a loose string, not an FK —
  // audit/escalation rows outlive their targets by design).
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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Takedown requests</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {pending.length} awaiting your decision
          </p>
        </div>
        {/* Only admins reach this page, so the nav is the admin one. */}
        <AdminNav role="ADMIN" current="/takedowns" />
      </header>

      {pending.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg font-medium">Nothing pending</p>
          <p className="mt-1 text-neutral-500">
            Curator takedown requests appear here for your decision.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-5">
          {pending.map((p) => (
            <li key={p.escalationId}>
              <TakedownRequestCard request={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
