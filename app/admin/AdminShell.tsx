// app/admin/AdminShell.tsx — the portal's frame: a persistent left rail.
//
// SIGNATURE ELEMENT: the rail is a status board. Every section a role can reach
// shows its count, and anything awaiting a decision is marked in ochre. You see
// what needs doing before you click anything — the rail answers "what should I
// be looking at" without navigation.
//
// A rail rather than top nav because staff move between queues constantly:
// keeping them one click apart, always in the same place, is worth the
// horizontal space. It also gives the portal a fixed spine, which a tool wants
// and a magazine doesn't.
//
// Counts are passed in from the server so the rail is accurate on every load
// (admin pages are force-dynamic, so this is never stale).

import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";

export type AdminRole = "CURATOR" | "MODERATOR" | "ADMIN";

const RANK: Record<AdminRole, number> = { CURATOR: 1, MODERATOR: 2, ADMIN: 3 };

export type RailCounts = {
  requests?: number;
  places?: number;
  placesNeedingImage?: number;
  moments?: number;
  takedowns?: number;
  staff?: number;
};

type Item = {
  href: string;
  label: string;
  minRole: AdminRole;
  count?: number;
  /** true when this number represents work waiting on you */
  awaiting?: boolean;
};

function itemsFor(role: AdminRole, counts: RailCounts): Item[] {
  const all: Item[] = [
    {
      href: "/requests",
      label: "Requests",
      minRole: "CURATOR",
      count: counts.requests,
      awaiting: (counts.requests ?? 0) > 0,
    },
    {
      href: "/locations",
      label: "Places",
      minRole: "CURATOR",
      count: counts.places,
      awaiting: (counts.placesNeedingImage ?? 0) > 0,
    },
    {
      href: "/moments",
      label: "Moments",
      minRole: "MODERATOR",
      count: counts.moments,
    },
    {
      href: "/takedowns",
      label: "Takedowns",
      minRole: "ADMIN",
      count: counts.takedowns,
      awaiting: (counts.takedowns ?? 0) > 0,
    },
    { href: "/users", label: "Accounts", minRole: "ADMIN", count: counts.staff },
  ];
  return all.filter((i) => RANK[role] >= RANK[i.minRole]);
}

const ROLE_LABEL: Record<AdminRole, string> = {
  CURATOR: "Curator",
  MODERATOR: "Moderator",
  ADMIN: "Administrator",
};

export function AdminShell({
  role,
  email,
  current,
  counts,
  twoFactorOn,
  title,
  subtitle,
  actions,
  children,
}: {
  role: AdminRole;
  email: string;
  current: string;
  counts: RailCounts;
  twoFactorOn: boolean;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const items = itemsFor(role, counts);

  return (
    <div className="admin-root flex min-h-screen">
      {/* The rail — fixed spine and status board. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] sm:flex">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <Link href="/" className="block">
            <p className="admin-eyebrow">Staff</p>
            <p className="mt-0.5 text-sm font-semibold leading-tight">
              Australia
              <br />
              Is Beautiful
            </p>
          </Link>
        </div>

        <nav className="flex-1 px-2 py-3">
          {items.map((i) => {
            const active = current === i.href;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`mb-0.5 flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--sunken)] font-medium text-[var(--ink)]"
                    : "text-[var(--muted)] hover:bg-[var(--sunken)] hover:text-[var(--ink)]"
                }`}
              >
                <span>{i.label}</span>
                {typeof i.count === "number" && (
                  <span
                    className="admin-data text-xs"
                    style={{
                      color: i.awaiting ? "var(--attention)" : "var(--muted)",
                      fontWeight: i.awaiting ? 600 : 400,
                    }}
                  >
                    {i.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--line)] px-5 py-4">
          {!twoFactorOn && (
            <Link
              href="/security"
              className="mb-3 block rounded px-2 py-1.5 text-xs"
              style={{
                background: "var(--attention-soft)",
                color: "var(--attention)",
                border: "1px solid var(--attention)",
              }}
            >
              Set up two-factor →
            </Link>
          )}
          <p className="admin-eyebrow">{ROLE_LABEL[role]}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]" title={email}>
            {email}
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <Link
              href="/security"
              className="text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
            >
              Security
            </Link>
            <AdminSignOut />
          </div>
        </div>
      </aside>

      {/* Mobile top bar — the rail collapses to a horizontal strip. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-4 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2 sm:hidden">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`whitespace-nowrap text-sm ${
                current === i.href
                  ? "font-medium text-[var(--ink)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {i.label}
              {typeof i.count === "number" && (
                <span
                  className="admin-data ml-1 text-xs"
                  style={{ color: i.awaiting ? "var(--attention)" : "var(--muted)" }}
                >
                  {i.count}
                </span>
              )}
            </Link>
          ))}
        </div>

        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {subtitle && (
                <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
              )}
            </div>
            {actions}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
