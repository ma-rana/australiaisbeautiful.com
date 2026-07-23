// app/admin/context.ts — the shell's data, fetched once per page.
//
// Every admin page needs the same frame: who you are, what your role can reach,
// and the counts that make the rail a status board. This gathers it in one
// place so pages don't each hand-roll it (and drift).
//
// Counts are scoped by role — a curator's rail never queries the moment table,
// because a curator can't see moments.

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { AdminRole, RailCounts } from "./AdminShell";

export type AdminContext = {
  userId: string;
  email: string;
  role: AdminRole;
  counts: RailCounts;
  twoFactorOn: boolean;
};

export async function getAdminContext(): Promise<AdminContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.role === "EXPLORER") return null;

  const role = user.role as AdminRole;
  const isModerator = role === "MODERATOR" || role === "ADMIN";
  const isAdmin = role === "ADMIN";

  const [
    requests,
    places,
    placesNeedingImage,
    moments,
    takedowns,
    staff,
    account,
  ] = await Promise.all([
    db.locationRequestCluster.count({ where: { status: "OPEN" } }),
    db.location.count({ where: { status: "APPROVED" } }),
    db.location.count({
      where: { status: "APPROVED", coverKey: null, heroMediaId: null },
    }),
    isModerator
      ? db.moment.count({ where: { status: "APPROVED" } })
      : Promise.resolve(undefined),
    isAdmin
      ? db.escalation.count({
          where: {
            targetType: "LOCATION",
            status: { in: ["OPEN", "ACKNOWLEDGED"] },
          },
        })
      : Promise.resolve(undefined),
    isAdmin
      ? db.user.count({ where: { role: { in: ["CURATOR", "MODERATOR", "ADMIN"] } } })
      : Promise.resolve(undefined),
    db.user.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true },
    }),
  ]);

  const counts: RailCounts = {
    requests,
    places,
    placesNeedingImage,
    moments,
    takedowns,
    staff,
  };

  return {
    userId: user.id,
    email: user.email,
    role,
    counts,
    twoFactorOn: account?.totpEnabled ?? false,
  };
}
