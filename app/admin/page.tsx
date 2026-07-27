// app/admin/page.tsx — the portal landing: the map, for every role.
//
// All staff land on /map (ADMIN.md §2c): the map is the shared overview, and
// it's already role-filtered — a curator lands on their red request pins, a
// moderator on their activity circles, an admin on both with the approved
// layer laid under. One door, each role seeing their own work on arrival;
// the rail carries the queues from there.
//
// The guard still runs FIRST here (belt and braces): /map guards itself too,
// but the landing route must never be an unguarded hop.

import { requireCurator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminHome() {
  try {
    await requireCurator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This account doesn&apos;t have staff access.
          </p>
        </main>
      );
    }
    throw e;
  }

  redirect("/map");
}
