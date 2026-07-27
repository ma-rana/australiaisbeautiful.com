// app/admin/cost/page.tsx — free-tier headroom, the AWARENESS half of the cost
// guards (COST_GUARDS.md, ADMIN.md §3 /admin/cost).
//
// ADMIN only: cost decisions are an admin concern (upgrade/prune/move/degrade,
// COST_GUARDS §5). Read-only — no controls, no actions, the lowest-risk shape.
//
// This page is NOT the alarm. It helps when you look. The prevention half is
// scripts/cost-guard-check.ts on a timer, which pages you whether or not anyone
// is watching — because a page you're not watching won't stop a charge
// (COST_GUARDS §3). This page and that cron read the SAME registry and the SAME
// evaluate(), so awareness and prevention can't disagree about what "warning"
// means.
//
// Headroom, not just usage: each row shows how close to the ceiling it is, with
// a visible band as it approaches. A failed read shows "unknown — check needed",
// never a reassuring green (§4: blind is bad).

import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { evaluateAll, type CostReading, type CostStatus } from "@/lib/cost-guards";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";

// Force a fresh measurement every load — a cached headroom number is a lie the
// moment usage moves.
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<
  CostStatus,
  { label: string; color: string; bar: string }
> = {
  ok: { label: "OK", color: "var(--action)", bar: "var(--action)" },
  warn: { label: "Near limit", color: "var(--attention)", bar: "var(--attention)" },
  over: { label: "Over free tier", color: "var(--danger)", bar: "var(--danger)" },
  unknown: {
    label: "Unknown — check needed",
    color: "var(--attention)",
    bar: "var(--attention)",
  },
  pending: { label: "Not wired yet", color: "var(--muted)", bar: "var(--line-strong)" },
};

function fmt(n: number, unit: string): string {
  // Whole-ish numbers read cleaner; keep one decimal for GB-scale.
  const v = unit === "GB" ? n.toFixed(1) : Math.round(n).toString();
  return `${v} ${unit}`;
}

function GaugeRow({ r }: { r: CostReading }) {
  const s = STATUS_STYLE[r.status];
  // Bar width: real percent when known, a faint full-width track otherwise.
  const pct =
    r.percent === null ? 0 : Math.min(100, Math.max(2, Math.round(r.percent)));

  return (
    <div className="admin-panel px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{r.label}</p>
          {r.note && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{r.note}</p>
          )}
        </div>
        <span
          className="rounded px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide"
          style={{ color: "#fff", background: s.color }}
        >
          {s.label}
        </span>
      </div>

      {/* The gauge. A track with a fill; the warn line marked as a tick so the
          headroom is visible, not just the number. */}
      <div className="mt-3">
        <div
          className="relative h-2.5 overflow-hidden rounded-full"
          style={{ background: "var(--sunken)" }}
        >
          {r.percent !== null && (
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width]"
              style={{ width: `${pct}%`, background: s.bar }}
            />
          )}
          {/* Warn-line tick — where the alarm fires. */}
          {r.status !== "pending" && (
            <div
              className="absolute inset-y-0 w-px"
              style={{
                left: `${r.warnAtPercent}%`,
                background: "var(--ink)",
                opacity: 0.35,
              }}
              title={`Warns at ${r.warnAtPercent}%`}
            />
          )}
        </div>

        <div className="admin-data mt-1.5 flex justify-between text-xs text-[var(--muted)]">
          <span>
            {r.usage === null
              ? r.status === "pending"
                ? "—"
                : "couldn't measure"
              : `${fmt(r.usage, r.unit)} of ${fmt(r.freeLimit, r.unit)}`}
          </span>
          <span style={{ color: s.color }}>
            {r.percent === null ? "" : `${Math.round(r.percent)}% of free tier`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default async function CostPage() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Cost and usage is an administrator&apos;s concern.
          </p>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;
  const readings = await evaluateAll();

  const anyAttention = readings.some(
    (r) => r.status === "warn" || r.status === "over" || r.status === "unknown",
  );

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/cost"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Cost & usage"
      subtitle="Free-tier headroom for every metered service. Crossing a line is a decision, not a surprise."
    >
      {/* The alarm is elsewhere — say so, so nobody mistakes this page for the
          thing that protects them (COST_GUARDS §3). */}
      <div
        className="mb-5 rounded px-3 py-2.5 text-xs"
        style={{
          background: anyAttention ? "var(--attention-soft)" : "var(--sunken)",
          border: anyAttention ? "1px solid var(--attention)" : "1px solid var(--line)",
          color: anyAttention ? "var(--attention)" : "var(--muted)",
        }}
      >
        {anyAttention
          ? "Something is near or over a free-tier line, or couldn't be measured. Decide: upgrade, prune, move, or turn it off — before the line is crossed."
          : "All metered services are within their free tiers. This page is awareness; the scheduled cost-guard check is what alerts you when you're not looking."}
      </div>

      <div className="space-y-3">
        {readings.map((r) => (
          <GaugeRow key={r.key} r={r} />
        ))}
      </div>

      {/* Maps are a file you own, not metered — say so explicitly so it's clear
          it isn't an un-watched risk (COST_GUARDS §2). */}
      <div className="admin-panel mt-3 px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Map tiles (Protomaps)</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              A .pmtiles file you own and serve yourself. No per-load billing,
              ever — listed here to say it isn&apos;t a metered risk.
            </p>
          </div>
          <span className="admin-eyebrow shrink-0">Not metered</span>
        </div>
      </div>

      <p className="mt-6 text-xs text-[var(--muted)]">
        Limits come from config, not this page — move them where the tiers move.
        The warn line (the tick on each gauge) is where the scheduled check
        raises the alarm. No paid tier is ever upgraded automatically; crossing a
        line hands you the decision early.
      </p>
    </AdminShell>
  );
}
