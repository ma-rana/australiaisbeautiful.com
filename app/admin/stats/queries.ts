// app/admin/stats/queries.ts — the aggregate numbers for /admin/stats.
//
// TWO HARD RULES (ADMIN.md §3, D19), enforced here at the query layer because
// this is where they're kept or broken:
//
//   1. COUNTS, NOT TRAILS. Every value is a count() / aggregate() over rows that
//      already exist. Nothing reconstructs an individual's activity or movement.
//      "40 contributors this week" — yes. "what did user X do" — never. There is
//      deliberately NO query here that returns a per-user row, a last-seen, or a
//      roster. If you're ever tempted to add `select: { userId }` to surface
//      "who", stop — that's the browse-everyone view the product refuses,
//      wearing an analytics hat.
//
//   2. RATES OVER VANITY. The numbers that lead are the ones that can go DOWN —
//      "contributors this week", "signups this week" — because those warn you.
//      Lifetime totals are shown as context, never as the headline (a "1,247
//      users" that hides 1,200 who left tells you nothing).
//
// All of this is read-only. No writes, no audit, no mutation — the lowest-risk
// page in the admin surface.

import { db } from "@/lib/db";

// A week ago, from now. The window for every "this week" rate.
function weekAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}
function fourWeeksAgo(): Date {
  return new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
}

export type WeeklyPoint = { weekStart: string; count: number };

export type AdminStats = {
  // The number that decides the project (ADMIN.md §3).
  contributorsThisWeek: number; // distinct non-seed contributors, last 7d
  momentsThisWeek: number;
  locationsWithMoments: number; // approved locations with ≥1 non-seed moment

  // People — counts only, never a roster.
  totalUsers: number;
  signupsThisWeek: number; // the rate that can fall — watch this
  activeUsersThisWeek: number; // distinct users who DID something, last 7d
  verifiedUsers: number;

  // Content.
  approvedLocations: number;
  pendingLocations: number;
  rejectedLocations: number;
  approvedMoments: number;
  totalMediaFiles: number;
  ratingsSubmitted: number;
  locationsOverRatingThreshold: number;
  reactionsThisWeek: number;

  // Operational — the numbers that run the platform.
  queuePendingMoments: number; // pending FILES (per-file queue)
  queuePendingLocations: number;
  queueOpenReports: number;
  queueOpenEscalations: number;
  queueOpenSupport: number;
  medianMomentDecisionHours: number | null; // SLA — the growth bottleneck
  rejectionsByKind: { kind: string; count: number }[];
  mediaBytesStored: number;

  // Slices — all counts.
  momentsByState: { state: string; count: number }[];
  locationsByCategory: { category: string; count: number }[];

  // Trend — weekly moment counts over the last 4 weeks (a number that moves).
  momentsWeekly: WeeklyPoint[];
};

export async function getAdminStats(): Promise<AdminStats> {
  const since = weekAgo();
  const since4w = fourWeeksAgo();

  const [
    contributorsThisWeek,
    momentsThisWeek,
    locationsWithMoments,
    totalUsers,
    signupsThisWeek,
    activeContribW,
    activeRateW,
    activeReactW,
    verifiedUsers,
    approvedLocations,
    pendingLocations,
    rejectedLocations,
    approvedMoments,
    totalMediaFiles,
    ratingsSubmitted,
    locationsOverRatingThreshold,
    reactionsThisWeek,
    queuePendingMoments,
    queuePendingLocations,
    queueOpenReports,
    queueOpenEscalations,
    queueOpenSupport,
    rejectionGroups,
    mediaBytesRows,
    momentsByStateRows,
    locationsByCategoryGroups,
    momentDecisionRows,
    momentsWeeklyRows,
  ] = await Promise.all([
    // Distinct non-seed contributors this week. A seed moment has userId null,
    // so "non-seed contributor" = distinct non-null userId in the window.
    db.moment
      .findMany({
        where: { createdAt: { gte: since }, userId: { not: null } },
        distinct: ["userId"],
        select: { userId: true },
      })
      .then((rows) => rows.length),

    db.moment.count({ where: { createdAt: { gte: since } } }),

    // Approved locations with ≥1 non-seed moment. Count distinct locationIds
    // among approved+public non-seed moments.
    db.moment
      .findMany({
        where: { status: "APPROVED", isPublic: true, userId: { not: null } },
        distinct: ["locationId"],
        select: { locationId: true },
      })
      .then((rows) => rows.length),

    db.user.count(),
    db.user.count({ where: { createdAt: { gte: since } } }),

    // Active users = distinct users who DID something this week. Computed as the
    // union of distinct actor ids across the action tables — never stored, never
    // a per-user row leaves this function.
    db.moment
      .findMany({
        where: { createdAt: { gte: since }, userId: { not: null } },
        distinct: ["userId"],
        select: { userId: true },
      })
      .then((r) => r.map((x) => x.userId)),
    db.rating
      .findMany({
        where: { createdAt: { gte: since } },
        distinct: ["userId"],
        select: { userId: true },
      })
      .then((r) => r.map((x) => x.userId)),
    db.reaction
      .findMany({
        where: { createdAt: { gte: since } },
        distinct: ["userId"],
        select: { userId: true },
      })
      .then((r) => r.map((x) => x.userId)),

    db.user.count({ where: { isVerified: true } }),

    db.location.count({ where: { status: "APPROVED" } }),
    db.location.count({ where: { status: "PENDING" } }),
    db.location.count({ where: { status: "REJECTED" } }),
    db.moment.count({ where: { status: "APPROVED" } }),
    db.momentMedia.count(),
    db.rating.count(),

    // Locations that have crossed their rating threshold (ratings visible).
    db.location
      .findMany({
        where: { status: "APPROVED" },
        select: { ratingCount: true, ratingThreshold: true },
      })
      .then(
        (rows) =>
          rows.filter((l) => l.ratingCount >= l.ratingThreshold).length,
      ),

    db.reaction.count({ where: { createdAt: { gte: since } } }),

    // Operational queue depth.
    db.momentMedia.count({ where: { status: "PENDING" } }),
    db.location.count({ where: { status: "PENDING" } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.escalation.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    db.supportMessage.count({ where: { status: "OPEN" } }),

    // Rejection rate by kind (moments). Aggregate group-by — a count per kind.
    db.moment.groupBy({
      by: ["rejectionKind"],
      where: { status: "REJECTED", rejectionKind: { not: null } },
      _count: { _all: true },
    }),

    // Media bytes stored — sum of byteSize from the JSONB (same source as the
    // cost page's media row).
    db.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM((("mediaMeta"->>'byteSize'))::bigint) AS total
      FROM "MomentMedia"
      WHERE "mediaMeta" ? 'byteSize'
    `,

    // Moments by state — join through location. Aggregate count per state.
    db.$queryRaw<{ state: string; count: bigint }[]>`
      SELECT l."state"::text AS state, COUNT(m.*) AS count
      FROM "Moment" m
      JOIN "Location" l ON l."id" = m."locationId"
      WHERE m."status" = 'APPROVED'
      GROUP BY l."state"
      ORDER BY count DESC
    `,

    db.location.groupBy({
      by: ["category"],
      where: { status: "APPROVED" },
      _count: { _all: true },
    }),

    // Median time-to-decision for moments: moderatedAt - createdAt, over decided
    // moments. Pulled as raw durations; median computed in JS (small set).
    db.$queryRaw<{ hours: number }[]>`
      SELECT EXTRACT(EPOCH FROM (m."moderatedAt" - m."createdAt")) / 3600 AS hours
      FROM "Moment" m
      WHERE m."moderatedAt" IS NOT NULL
    `,

    // Weekly moment counts, last 4 weeks — a trend that moves.
    db.$queryRaw<{ week: Date; count: bigint }[]>`
      SELECT date_trunc('week', "createdAt") AS week, COUNT(*) AS count
      FROM "Moment"
      WHERE "createdAt" >= ${since4w}
      GROUP BY week
      ORDER BY week ASC
    `,
  ]);

  // Active = distinct union across the three action sets.
  const activeSet = new Set<string>();
  for (const id of [...activeContribW, ...activeRateW, ...activeReactW]) {
    if (id) activeSet.add(id);
  }

  // Median decision hours.
  const durations = momentDecisionRows
    .map((r) => Number(r.hours))
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const medianMomentDecisionHours =
    durations.length === 0
      ? null
      : durations.length % 2 === 1
        ? durations[(durations.length - 1) / 2]
        : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2;

  return {
    contributorsThisWeek,
    momentsThisWeek,
    locationsWithMoments,

    totalUsers,
    signupsThisWeek,
    activeUsersThisWeek: activeSet.size,
    verifiedUsers,

    approvedLocations,
    pendingLocations,
    rejectedLocations,
    approvedMoments,
    totalMediaFiles,
    ratingsSubmitted,
    locationsOverRatingThreshold,
    reactionsThisWeek,

    queuePendingMoments,
    queuePendingLocations,
    queueOpenReports,
    queueOpenEscalations,
    queueOpenSupport,
    medianMomentDecisionHours,
    rejectionsByKind: rejectionGroups.map((g) => ({
      kind: g.rejectionKind ?? "UNKNOWN",
      count: g._count._all,
    })),
    mediaBytesStored: Number(mediaBytesRows[0]?.total ?? 0),

    momentsByState: momentsByStateRows.map((r) => ({
      state: r.state,
      count: Number(r.count),
    })),
    locationsByCategory: locationsByCategoryGroups.map((g) => ({
      category: g.category,
      count: g._count._all,
    })),

    momentsWeekly: momentsWeeklyRows.map((r) => ({
      weekStart: new Date(r.week).toISOString().slice(0, 10),
      count: Number(r.count),
    })),
  };
}
