"use client";

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
// COLLAPSIBLE, the Google-Maps-panel way: minimized, the rail keeps every
// icon (with its awaiting-badge) in the same order at the same height, so a
// staff member's muscle memory survives the collapse — only the labels fold
// away. The preference persists per browser (localStorage), because a rail
// that re-expands on every navigation isn't a preference, it's a nag.
// Client component for exactly that state; the pages stay server-rendered
// and flow through as children.
//
// Counts are passed in from the server so the rail is accurate on every load
// (admin pages are force-dynamic, so this is never stale).

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";
import {
  MapIcon,
  InboxIcon,
  PinIcon,
  PhotoIcon,
  ShieldIcon,
  UsersIcon,
  KeyIcon,
  CollapseIcon,
} from "./AdminIcons";

export type AdminRole = "CURATOR" | "MODERATOR" | "ADMIN";

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
  /** Which roles see this in THEIR rail. This is job-focus (ADMIN.md §2,
   *  nav filtering is UX), not authorization — every route still guards
   *  itself, and the rank ladder (moderator ⊇ curator powers) is unchanged.
   *  A moderator's rail shows moderation, a curator's shows curation; the
   *  admin sees everything. */
  roles: AdminRole[];
  icon: React.ComponentType<{ size?: number }>;
  count?: number;
  /** true when this number represents work waiting on you */
  awaiting?: boolean;
};

function itemsFor(role: AdminRole, counts: RailCounts): Item[] {
  const requestsWaiting =
    role !== "MODERATOR" && (counts.requests ?? 0) > 0;
  const all: Item[] = [
    {
      // The spatial surface (ADMIN.md §2c) — first. Every role sees the map;
      // the map itself shows each role only their layers. No count when the
      // queue is clear (a "0" reads as an empty queue named Map), and no
      // request count at all for moderators — requests aren't their job.
      href: "/map",
      label: "Map",
      roles: ["CURATOR", "MODERATOR", "ADMIN"],
      icon: MapIcon,
      count: requestsWaiting ? counts.requests : undefined,
      awaiting: requestsWaiting,
    },
    {
      // Curation work — not on a moderator's rail (job focus, §2a: the
      // moment queue is their job; the location call is the curator's).
      href: "/requests",
      label: "Requests",
      roles: ["CURATOR", "ADMIN"],
      icon: InboxIcon,
      count: counts.requests,
      awaiting: (counts.requests ?? 0) > 0,
    },
    {
      href: "/locations",
      label: "Places",
      roles: ["CURATOR", "ADMIN"],
      icon: PinIcon,
      count: counts.places,
      awaiting: (counts.placesNeedingImage ?? 0) > 0,
    },
    {
      // Moderation work — not on a curator's rail (the same split the guard
      // rationale in lib/auth.ts describes: curators shape the map without
      // ever being handed the content queue).
      href: "/moments",
      label: "Moments",
      roles: ["MODERATOR", "ADMIN"],
      icon: PhotoIcon,
      count: counts.moments,
    },
    {
      href: "/takedowns",
      label: "Takedowns",
      roles: ["ADMIN"],
      icon: ShieldIcon,
      count: counts.takedowns,
      awaiting: (counts.takedowns ?? 0) > 0,
    },
    {
      href: "/users",
      label: "Accounts",
      roles: ["ADMIN"],
      icon: UsersIcon,
      count: counts.staff,
    },
  ];
  return all.filter((i) => i.roles.includes(role));
}

const ROLE_LABEL: Record<AdminRole, string> = {
  CURATOR: "Curator",
  MODERATOR: "Moderator",
  ADMIN: "Administrator",
};

// The collapse preference — a browser-local view setting, versioned like the
// map's saved views.
const RAIL_KEY = "aib:admin-rail:v1";

export function AdminShell({
  role,
  email,
  current,
  counts,
  twoFactorOn,
  title,
  subtitle,
  actions,
  wide = false,
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
  /** Full-bleed content (the map). Default is a centred reading measure —
   *  review cards stretched across a 1600px window are the "mobile design
   *  widened" failure (UX §3), so queues get max-w-4xl unless a surface
   *  genuinely earns the whole width. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const items = itemsFor(role, counts);

  // Expanded on the server render; the saved preference applies on mount.
  // (Reading localStorage during render would tear SSR hydration.)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(RAIL_KEY) === "1");
    } catch {
      /* storage unavailable — stay expanded */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(RAIL_KEY, c ? "0" : "1");
      } catch {
        /* fine */
      }
      return !c;
    });
  };

  return (
    <div className="admin-root flex min-h-screen">
      {/* The rail — fixed spine and status board. STICKY at viewport height:
          a 3,000px moments list must not drag the account block 3,000px down
          (or crush it) — the rail is chrome, pinned to the screen, and its
          nav scrolls internally if it ever outgrows the viewport. Width
          animates; the icon column never moves, so collapse only folds the
          labels away. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] transition-[width] duration-200 sm:flex ${
          collapsed ? "w-[3.75rem]" : "w-56"
        }`}
      >
        {/* Masthead — and the collapse control. The whole tile toggles the
            rail, the way Google Maps' own panel chrome does: the mark you
            already look at IS the handle, no extra button row spending a
            whole rail slot on chrome. A quiet chevron on the trailing edge
            (expanded) keeps it discoverable. */}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="flex h-[4.25rem] w-full items-center border-b border-[var(--line)] px-3 text-left transition-colors hover:bg-[var(--sunken)]"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[0.7rem] font-bold tracking-wide text-white"
              style={{ background: "var(--action)" }}
            >
              AIB
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="admin-eyebrow block">Staff</span>
                <span className="block truncate text-sm font-semibold leading-tight">
                  Australia Is Beautiful
                </span>
              </span>
            )}
          </span>
          {!collapsed && (
            <span aria-hidden className="shrink-0 text-[var(--muted)]">
              <CollapseIcon size={16} />
            </span>
          )}
        </button>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {items.map((i) => {
            const active = current === i.href;
            const Icon = i.icon;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? i.label : undefined}
                className={`relative mb-0.5 flex items-center rounded-md py-2 text-sm transition-colors ${
                  collapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  active
                    ? "bg-[var(--sunken)] font-medium text-[var(--ink)]"
                    : "text-[var(--muted)] hover:bg-[var(--sunken)] hover:text-[var(--ink)]"
                }`}
              >
                {/* The active accent — a quiet bar on the spine's edge, so
                    the current section reads even icon-only. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
                    style={{ background: "var(--action)" }}
                  />
                )}

                <span className="relative shrink-0" aria-hidden>
                  <Icon size={19} />
                  {/* Collapsed, the awaiting count survives as a badge on the
                      icon — the status board keeps working at any width. */}
                  {collapsed && i.awaiting && (i.count ?? 0) > 0 && (
                    <span
                      className="admin-data absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
                      style={{ background: "var(--attention)" }}
                    >
                      {i.count! > 99 ? "99+" : i.count}
                    </span>
                  )}
                </span>

                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
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
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Account block. Collapsed: the security key (wearing the 2FA nudge
            as a badge) — everything else needs the expanded rail. */}
        <div
          className={`border-t border-[var(--line)] ${
            collapsed ? "px-2 py-3" : "px-4 py-4"
          }`}
        >
          {collapsed ? (
            <Link
              href="/security"
              title={twoFactorOn ? "Security" : "Security — set up two-factor"}
              className="relative flex items-center justify-center rounded-md py-2 text-[var(--muted)] transition-colors hover:bg-[var(--sunken)] hover:text-[var(--ink)]"
            >
              <KeyIcon size={19} />
              {!twoFactorOn && (
                <span
                  aria-hidden
                  className="absolute right-2 top-1 h-2 w-2 rounded-full"
                  style={{ background: "var(--attention)" }}
                />
              )}
            </Link>
          ) : (
            <>
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
              <p
                className="mt-0.5 truncate text-xs text-[var(--muted)]"
                title={email}
              >
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
            </>
          )}
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
                  style={{
                    color: i.awaiting ? "var(--attention)" : "var(--muted)",
                  }}
                >
                  {i.count}
                </span>
              )}
            </Link>
          ))}
        </div>

        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">
          {/* The reading measure. Full-bleed only when a surface asks for it
              (the map); everything else centres at a width a person can scan. */}
          <div className={`w-full ${wide ? "" : "mx-auto max-w-4xl"}`}>
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
          </div>
        </main>
      </div>
    </div>
  );
}
