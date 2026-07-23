// app/admin/AdminNav.tsx — role-aware admin navigation.
//
// You see what you can ACT ON. The permissions are enforced server-side on every
// page and action; this is about not showing someone a link that will bounce
// them — which is confusing and makes the tool feel arbitrary.
//
// The tiers are hierarchical (ROLE_RANK in lib/auth.ts):
//   CURATOR   — Requests, Places        (shapes the map)
//   MODERATOR — + Moments               (also reviews what people upload)
//   ADMIN     — + Takedowns             (rules on removal requests)
//
// The curator/moderator split is deliberate and one-directional: approving a
// photo means looking at whatever a stranger uploaded, which is a different
// trust boundary from deciding whether a place belongs on the map. A curator is
// protected from that queue; a moderator isn't kept out of the map.

import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";

export type AdminRole = "CURATOR" | "MODERATOR" | "ADMIN";

const RANK: Record<AdminRole, number> = {
  CURATOR: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

type NavItem = { href: string; label: string; minRole: AdminRole };

const ITEMS: NavItem[] = [
  { href: "/requests", label: "Requests", minRole: "CURATOR" },
  { href: "/locations", label: "Places", minRole: "CURATOR" },
  { href: "/moments", label: "Moments", minRole: "MODERATOR" },
  { href: "/takedowns", label: "Takedowns", minRole: "ADMIN" },
  { href: "/users", label: "Accounts", minRole: "ADMIN" },
  { href: "/security", label: "Security", minRole: "CURATOR" },
];

export function visibleNavFor(role: AdminRole): NavItem[] {
  return ITEMS.filter((i) => RANK[role] >= RANK[i.minRole]);
}

export function AdminNav({
  role,
  current,
}: {
  role: AdminRole;
  current?: string;
}) {
  const items = visibleNavFor(role);

  return (
    <div className="flex items-center gap-4 text-sm">
      {items
        .filter((i) => i.href !== current)
        .map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {i.label}
          </Link>
        ))}
      <AdminSignOut />
    </div>
  );
}
