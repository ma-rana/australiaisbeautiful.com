// app/admin/locations/page.tsx — every place on the map, for editing.
//
// A table-like list rather than cards: staff scan this looking for a specific
// place, and rows scan faster than cards. Places missing an image are flagged
// inline — they render as blank to visitors, so they're work, not just data.

import { db } from "@/lib/db";
import { requireCurator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";

export default async function LocationsIndex() {
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

  const locations = await db.location.findMany({
    where: { status: { in: ["APPROVED", "PENDING", "UNDER_REVIEW", "ARCHIVED"] } },
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

  const heroIds = locations.map((l) => l.heroMediaId).filter((x): x is string => !!x);
  const heroes = heroIds.length
    ? await db.momentMedia.findMany({
        where: { id: { in: heroIds }, status: "APPROVED" },
        select: { id: true, thumbKey: true, mediaKey: true },
      })
    : [];
  const heroById = new Map(heroes.map((h) => [h.id, h.thumbKey ?? h.mediaKey]));

  const rows = locations.map((l) => ({
    ...l,
    face: resolveMediaSrc(
      (l.heroMediaId ? heroById.get(l.heroMediaId) : null) ?? l.coverThumbKey,
    ),
  }));

  const needsImage = rows.filter(
    (r) => r.status === "APPROVED" && !r.face,
  ).length;

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/locations"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Places"
      subtitle={`${locations.length} on the map`}
    >
      {needsImage > 0 && (
        <div className="admin-attention mb-5 px-4 py-3">
          <p className="text-sm" style={{ color: "var(--attention)" }}>
            <span className="font-semibold">
              {needsImage} {needsImage === 1 ? "place is" : "places are"} live with
              no image
            </span>{" "}
            — they show as blank cards to visitors.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="admin-panel px-5 py-12 text-center">
          <p className="text-sm font-medium">No places yet</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Approve a request to add the first.
          </p>
        </div>
      ) : (
        <ul className="admin-panel divide-y divide-[var(--line)]">
          {rows.map((loc) => (
            <li key={loc.id}>
              <Link
                href={`/locations/${loc.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--sunken)]"
              >
                {loc.face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={loc.face}
                    alt=""
                    className="h-12 w-16 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div
                    className="flex h-12 w-16 shrink-0 items-center justify-center rounded text-[0.6rem]"
                    style={{
                      background: "var(--attention-soft)",
                      border: "1px solid var(--attention)",
                      color: "var(--attention)",
                    }}
                  >
                    no image
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{loc.name}</p>
                  <p className="admin-data mt-0.5 text-xs text-[var(--muted)]">
                    {[loc.suburb, loc.state].filter(Boolean).join(", ")}
                    {" · "}
                    {loc._count.moments} moment{loc._count.moments === 1 ? "" : "s"}
                    {loc.status !== "APPROVED" && (
                      <span style={{ color: "var(--attention)" }}>
                        {" · "}
                        {loc.status.toLowerCase()}
                      </span>
                    )}
                  </p>
                </div>

                <span className="text-sm text-[var(--muted)]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
