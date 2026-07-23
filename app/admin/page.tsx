// app/admin/page.tsx — the portal landing page.
//
// The rail already shows counts, so this doesn't repeat them as cards. Instead
// it answers the question the rail can't: WHAT SHOULD I DO NEXT? A short list of
// actual work items, in priority order, each linking straight to it. When
// there's nothing, it says so plainly rather than inventing filler.

import { requireCurator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "./AdminShell";
import { getAdminContext } from "./context";

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

  const ctx = (await getAdminContext())!;
  const { counts, role } = ctx;

  // Work items, most pressing first. Only things that are genuinely waiting.
  const work: { href: string; label: string; detail: string }[] = [];

  if ((counts.takedowns ?? 0) > 0) {
    work.push({
      href: "/takedowns",
      label: `${counts.takedowns} takedown ${counts.takedowns === 1 ? "request" : "requests"}`,
      detail: "A curator has asked for a place to come off the map.",
    });
  }
  if ((counts.requests ?? 0) > 0) {
    work.push({
      href: "/requests",
      label: `${counts.requests} requested ${counts.requests === 1 ? "place" : "places"}`,
      detail: "People have suggested places. Most-wanted first.",
    });
  }
  if ((counts.placesNeedingImage ?? 0) > 0) {
    work.push({
      href: "/locations",
      label: `${counts.placesNeedingImage} ${counts.placesNeedingImage === 1 ? "place" : "places"} with no image`,
      detail: "They show as blank cards to visitors.",
    });
  }

  return (
    <AdminShell
      role={role}
      email={ctx.email}
      current="/"
      counts={counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Today"
      subtitle={
        work.length > 0
          ? "What's waiting on you."
          : "Nothing waiting — the queues are clear."
      }
    >
      {!ctx.twoFactorOn && (
        <div className="admin-attention mb-6 px-5 py-4">
          <p className="text-sm font-semibold" style={{ color: "var(--attention)" }}>
            Two-factor authentication is required for your account
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            You can change what the public sees. A password alone isn&apos;t
            enough protection for that.
          </p>
          <Link href="/security" className="admin-btn admin-btn-primary mt-3">
            Set it up
          </Link>
        </div>
      )}

      {work.length > 0 ? (
        <ul className="admin-panel divide-y divide-[var(--line)]">
          {work.map((w) => (
            <li key={w.href}>
              <Link
                href={w.href}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--sunken)]"
              >
                <div>
                  <p className="text-sm font-medium">{w.label}</p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">{w.detail}</p>
                </div>
                <span className="text-sm text-[var(--muted)]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="admin-panel px-5 py-10 text-center">
          <p className="text-sm font-medium">Everything&apos;s handled</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            New requests and contributions will appear here.
          </p>
        </div>
      )}

      {/* What this role covers — stated once, plainly, not as a mystery. */}
      <p className="mt-8 text-sm text-[var(--muted)]">
        {role === "CURATOR"
          ? "You shape the map: approving requested places and writing them up. Reviewing uploaded photos and removing places are handled by moderators and administrators."
          : role === "MODERATOR"
            ? "You handle the map and published content. Removing a place is an administrator decision — request one from any place's page."
            : "You have full access, including takedowns and account roles."}
      </p>
    </AdminShell>
  );
}
