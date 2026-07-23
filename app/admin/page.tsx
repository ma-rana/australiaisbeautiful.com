// app/admin/page.tsx — the admin landing page.
//
// Role-aware: shows only the sections you can act on, with counts of what's
// waiting. Signing in should immediately tell you what needs doing, not drop you
// on an arbitrary page.
//
// The counts are the point. "Requests: 3" is actionable; a list of links you
// might or might not need to visit isn't.

import { db } from "@/lib/db";
import {
  requireCurator,
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
} from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";
import type { AdminRole } from "./AdminNav";

export default async function AdminHome() {
  try {
    await requireCurator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-neutral-500">
            This account doesn&apos;t have staff access.
          </p>
        </main>
      );
    }
    throw e;
  }

  const user = await getSessionUser();
  const role = (user?.role ?? "CURATOR") as AdminRole;
  const isModerator = role === "MODERATOR" || role === "ADMIN";
  const isAdmin = role === "ADMIN";

  // Only count what this role can act on.
  const [openRequests, placeCount, needsImage, recentMoments, pendingTakedowns, staffCount] =
    await Promise.all([
      db.locationRequestCluster.count({ where: { status: "OPEN" } }),
      db.location.count({ where: { status: "APPROVED" } }),
      db.location.count({
        where: { status: "APPROVED", coverKey: null, heroMediaId: null },
      }),
      isModerator
        ? db.moment.count({ where: { status: "APPROVED" } })
        : Promise.resolve(0),
      isAdmin
        ? db.escalation.count({
            where: {
              targetType: "LOCATION",
              status: { in: ["OPEN", "ACKNOWLEDGED"] },
            },
          })
        : Promise.resolve(0),
      isAdmin
        ? db.user.count({ where: { role: { in: ["CURATOR", "MODERATOR", "ADMIN"] } } })
        : Promise.resolve(0),
    ]);

  const cards = [
    {
      href: "/requests",
      title: "Requested places",
      count: openRequests,
      unit: openRequests === 1 ? "waiting" : "waiting",
      blurb: "Places people want on the map. Most-wanted first.",
      show: true,
      urgent: openRequests > 0,
    },
    {
      href: "/locations",
      title: "Places",
      count: placeCount,
      unit: "on the map",
      blurb:
        needsImage > 0
          ? `${needsImage} live with no image`
          : "Edit write-ups, covers and pins.",
      show: true,
      urgent: needsImage > 0,
    },
    {
      href: "/moments",
      title: "Moments",
      count: recentMoments,
      unit: "published",
      blurb: "What's gone live. Remove anything that shouldn't be there.",
      show: isModerator,
      urgent: false,
    },
    {
      href: "/takedowns",
      title: "Takedown requests",
      count: pendingTakedowns,
      unit: "awaiting you",
      blurb: "Curators asking for a place to come off the map.",
      show: isAdmin,
      urgent: pendingTakedowns > 0,
    },
    {
      href: "/users",
      title: "Accounts",
      count: staffCount,
      unit: "with staff access",
      blurb: "Grant or revoke roles, suspend accounts.",
      show: isAdmin,
      urgent: false,
    },
  ].filter((c) => c.show);

  const roleLabel =
    role === "ADMIN" ? "Administrator" : role === "MODERATOR" ? "Moderator" : "Curator";

  // Has this staff member set up 2FA? Required for staff — surfaced here so it
  // can't be quietly ignored.
  const account = await db.user.findUnique({
    where: { id: user!.id },
    select: { totpEnabled: true },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Signed in as {roleLabel}
          </p>
        </div>
        <AdminSignOut />
      </header>

      {/* 2FA is required for staff. Say so at the top of the portal, every
          time, until it's done — not buried in a settings page nobody visits. */}
      {!account?.totpEnabled && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-800/60 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Two-factor authentication is required for your account
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
            You can change what the public sees. A password alone isn&apos;t
            enough protection for that.
          </p>
          <Link
            href="/security"
            className="mt-3 inline-block rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white"
          >
            Set it up now
          </Link>
        </div>
      )}

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className={`block rounded-lg border p-5 transition hover:border-neutral-400 dark:hover:border-neutral-600 ${
                c.urgent
                  ? "border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/20"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <p className="text-sm font-medium text-neutral-500">{c.title}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {c.count}
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  {c.unit}
                </span>
              </p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {c.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {/* What this role can't do — stated plainly, so it's not a mystery. */}
      {!isAdmin && (
        <p className="mt-8 text-sm text-neutral-500">
          {role === "CURATOR"
            ? "As a curator you shape the map: approving requested places and writing them up. Reviewing uploaded photos and removing places are handled by moderators and administrators."
            : "As a moderator you handle the map and published content. Removing a place from the map is an administrator decision — you can request one from any place's page."}
        </p>
      )}
    </main>
  );
}
