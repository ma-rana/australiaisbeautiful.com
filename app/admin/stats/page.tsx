// app/admin/stats/page.tsx — the read-only numbers page (ADMIN.md §3).
//
// One screen, numbers only. No controls, no actions, no per-user detail — the
// lowest-risk page in the admin surface. requireModerator so staff can see the
// operational numbers that run the platform.
//
// The ORDER encodes the priorities (§3): the number that decides the project
// first; rates (things that can go DOWN) ahead of vanity totals; operational
// health where a moderator will actually look. Everything is a count/avg over
// existing rows — no tracking, no roster, no "who did what".

import { requireModerator, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminStats } from "./queries";
import { AdminShell } from "../AdminShell";
import { getAdminContext } from "../context";

// Numbers move; never cache them.
export const dynamic = "force-dynamic";

// A single scannable number with a label. The value is monospace (admin-data)
// because it's a value to scan, not prose to read.
function Stat({
  value,
  label,
  hint,
  tone = "normal",
}: {
  value: string | number;
  label: string;
  hint?: string;
  tone?: "normal" | "attention" | "muted";
}) {
  const color =
    tone === "attention"
      ? "var(--attention)"
      : tone === "muted"
        ? "var(--muted)"
        : "var(--ink)";
  return (
    <div className="admin-panel px-4 py-3.5">
      <p
        className="admin-data text-2xl font-semibold leading-none"
        style={{ color }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-sm font-medium">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function Section({
  eyebrow,
  children,
  note,
}: {
  eyebrow: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <p className="admin-eyebrow">{eyebrow}</p>
      {note && <p className="mb-3 mt-1 text-xs text-[var(--muted)]">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

// A compact count-per-slice list (state, category, rejection kind). Aggregate
// only — a label and a number, never a drill-in to individuals.
function SliceList({
  rows,
  empty,
}: {
  rows: { label: string; count: number }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="admin-panel divide-y divide-[var(--line)]">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-28 shrink-0 text-sm">{r.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--sunken)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(r.count / max) * 100}%`,
                background: "var(--action)",
              }}
            />
          </div>
          <span className="admin-data w-10 shrink-0 text-right text-sm">
            {r.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n <= 0) return "0 MB";
  const mb = n / 1024 ** 2;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const STATE_ORDER = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const CATEGORY_LABEL: Record<string, string> = {
  BEACH: "Beach",
  NATIONAL_PARK: "National park",
  WATERFALL: "Waterfall",
  MOUNTAIN: "Mountain",
  LOOKOUT: "Lookout",
  UNIVERSITY: "University",
  MUSEUM: "Museum",
  HISTORIC_SITE: "Historic site",
  ZOO: "Zoo",
  CULTURAL_ATTRACTION: "Cultural",
  SPORTING_VENUE: "Sporting venue",
  MARKET: "Market",
  HIDDEN_GEM: "Hidden gem",
  OTHER: "Other",
};
const KIND_LABEL: Record<string, string> = {
  OUT_OF_SCOPE: "Out of scope",
  FIXABLE: "Fixable",
  DUPLICATE: "Duplicate",
  ABUSE: "Abuse",
  UNKNOWN: "Unspecified",
};

export default async function StatsPage() {
  try {
    await requireModerator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="admin-root px-6 py-20 text-center">
          <h1 className="text-xl font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            The numbers page is for moderators and admins.
          </p>
        </main>
      );
    }
    throw e;
  }

  const ctx = (await getAdminContext())!;
  const s = await getAdminStats();

  const decisionSla =
    s.medianMomentDecisionHours === null
      ? "—"
      : s.medianMomentDecisionHours < 1
        ? "<1h"
        : `${Math.round(s.medianMomentDecisionHours)}h`;

  return (
    <AdminShell
      role={ctx.role}
      email={ctx.email}
      current="/stats"
      counts={ctx.counts}
      twoFactorOn={ctx.twoFactorOn}
      title="Stats"
      subtitle="Aggregate numbers only — health, not surveillance. Rates that can fall sit ahead of totals."
    >
      {/* The number that decides the project (§3). Leads because it's the one
          that answers "is this working". */}
      <Section
        eyebrow="This week — the numbers that decide it"
        note="Distinct people and contributions in the last 7 days. These can go down, which is exactly why they're first."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            value={s.contributorsThisWeek}
            label="Contributors"
            hint="distinct people who shared a moment"
            tone={s.contributorsThisWeek === 0 ? "attention" : "normal"}
          />
          <Stat value={s.momentsThisWeek} label="Moments shared" />
          <Stat
            value={s.activeUsersThisWeek}
            label="Active users"
            hint="did something: shared, rated, reacted"
          />
        </div>
      </Section>

      {/* People — counts, never a roster. */}
      <Section eyebrow="People">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat
            value={s.signupsThisWeek}
            label="New signups this week"
            hint="the rate to watch"
          />
          <Stat value={s.totalUsers} label="Total users" tone="muted" />
          <Stat
            value={s.verifiedUsers}
            label="Verified"
            hint="identity only — grants nothing"
            tone="muted"
          />
          <Stat
            value={s.locationsWithMoments}
            label="Places with real moments"
            hint="approved, ≥1 community photo"
          />
        </div>
      </Section>

      {/* Content. */}
      <Section eyebrow="Content">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat value={s.approvedLocations} label="Approved places" />
          <Stat value={s.approvedMoments} label="Approved moments" />
          <Stat value={s.totalMediaFiles} label="Media files" tone="muted" />
          <Stat value={s.ratingsSubmitted} label="Ratings" tone="muted" />
          <Stat value={s.reactionsThisWeek} label="Reactions this week" />
          <Stat
            value={s.locationsOverRatingThreshold}
            label="Places showing a rating"
            hint="crossed the rating threshold"
            tone="muted"
          />
          <Stat value={s.pendingLocations} label="Pending places" tone="muted" />
          <Stat value={s.rejectedLocations} label="Rejected places" tone="muted" />
        </div>
      </Section>

      {/* Operational — what runs the platform, where a moderator looks. */}
      <Section
        eyebrow="Operational — the platform's pulse"
        note="Queue depth and the decision SLA. A backlog here is the growth bottleneck (MODERATION §7)."
      >
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            value={s.queuePendingMoments}
            label="Pending files"
            tone={s.queuePendingMoments > 0 ? "attention" : "normal"}
          />
          <Stat
            value={s.queuePendingLocations}
            label="Pending places"
            tone={s.queuePendingLocations > 0 ? "attention" : "normal"}
          />
          <Stat
            value={s.queueOpenReports}
            label="Open reports"
            tone={s.queueOpenReports > 0 ? "attention" : "normal"}
          />
          <Stat
            value={s.queueOpenEscalations}
            label="Open escalations"
            tone={s.queueOpenEscalations > 0 ? "attention" : "normal"}
          />
          <Stat
            value={s.queueOpenSupport}
            label="Open messages"
            tone={s.queueOpenSupport > 0 ? "attention" : "normal"}
          />
          <Stat
            value={decisionSla}
            label="Median decision time"
            hint="moment → decided"
          />
        </div>
      </Section>

      {/* Slices — all aggregate. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="admin-eyebrow mb-3">Moments by state</p>
          <SliceList
            rows={STATE_ORDER.map((st) => ({
              label: st,
              count: s.momentsByState.find((r) => r.state === st)?.count ?? 0,
            })).filter((r) => r.count > 0)}
            empty="No approved moments yet."
          />
        </div>
        <div>
          <p className="admin-eyebrow mb-3">Places by category</p>
          <SliceList
            rows={s.locationsByCategory
              .map((r) => ({
                label: CATEGORY_LABEL[r.category] ?? r.category,
                count: r.count,
              }))
              .sort((a, b) => b.count - a.count)}
            empty="No approved places yet."
          />
        </div>
      </div>

      {/* Rejection mix + storage — operational context. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="admin-eyebrow mb-3">Moment rejections by reason</p>
          <SliceList
            rows={s.rejectionsByKind
              .map((r) => ({
                label: KIND_LABEL[r.kind] ?? r.kind,
                count: r.count,
              }))
              .sort((a, b) => b.count - a.count)}
            empty="No rejections recorded."
          />
        </div>
        <div>
          <p className="admin-eyebrow mb-3">Storage</p>
          <div className="admin-panel px-4 py-3.5">
            <p className="admin-data text-2xl font-semibold leading-none">
              {fmtBytes(s.mediaBytesStored)}
            </p>
            <p className="mt-1.5 text-sm font-medium">Media stored</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Disk headroom lives on{" "}
              <a
                href="/cost"
                className="underline underline-offset-2 hover:text-[var(--ink)]"
              >
                Cost &amp; usage
              </a>
              , where the alarm watches it.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-8 text-xs text-[var(--muted)]">
        Every number here is an aggregate count over existing records. There is
        no per-person breakdown, no last-seen, and no way to reconstruct an
        individual&apos;s activity — by design (D19).
      </p>
    </AdminShell>
  );
}
