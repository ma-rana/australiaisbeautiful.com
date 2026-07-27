// lib/cost-guards.ts — the metered-dependency registry (COST_GUARDS.md).
//
// The promise (D18): free services only, except the VPS and the domain. This is
// the single watch over every metered dependency, so nothing crosses from free
// into billing without a DECISION. "A limit you can see coming is a decision; a
// limit you hit is an incident."
//
// ONE registry, not scattered checks. Adding a metered service = adding a row
// here (and its limit to config), never remembering months later to build
// monitoring for it. Both consumers read this one array:
//   - /admin/cost         — the awareness layer (a page you look at)
//   - scripts/cost-guard-check.ts — the prevention layer (a cron that pages you)
//
// THE WORST-CASE RULE (§4): usage() returning null means "couldn't measure",
// NOT "0, we're fine". A blind check must read as a warning, never as green —
// a cost guard that silently broke three weeks ago is how the bill is the first
// you hear of the limit. evaluate() below encodes that: null → status "unknown"
// → counts as a warn condition.

import { promises as fs } from "node:fs";
import { db } from "@/lib/db";

export type Metered = {
  key: string; // stable id: "vps_disk", "media_storage", ...
  label: string; // human name for the cost page
  unit: string; // "GB", "sends/mo", "%"
  freeLimit: number; // the ceiling the free tier / hardware ends at
  warnAt: number; // fraction (0.80 = warn at 80%)
  /** Current usage in `unit`. null = couldn't measure → treated as WARN. */
  usage: () => Promise<number | null>;
  resets: "monthly" | "never";
  /** Shown on the page so a not-yet-wired dependency reads honestly rather
   *  than as a real 0%. A pending row never triggers the alarm. */
  pending?: boolean;
  note?: string;
};

// --- config: limits live here, never hard-coded in a component (§1) ----------
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const DEFAULT_WARN = num(process.env.COST_GUARD_WARN_FRACTION, 0.8);
const R2_FREE_GB = num(process.env.R2_FREE_TIER_GB, 10);
const EMAIL_FREE = num(process.env.EMAIL_MONTHLY_FREE, 3000);
const DISK_WARN_PERCENT = num(process.env.STORAGE_WARN_PERCENT, 70);

// --- usage sources -----------------------------------------------------------

// VPS disk headroom. A full disk takes Postgres down — the REAL current ceiling
// while on local storage (COST_GUARDS §2). Measured as percent-used so the
// "limit" is 100 and the warn line is STORAGE_WARN_PERCENT.
//
// Uses statfs (available on Linux, the VPS). On a platform without it (local
// Windows dev), returns null → reads as "unknown", which is the correct honest
// answer there rather than a fake number.
async function diskPercentUsed(): Promise<number | null> {
  try {
    // node:fs statfs is Linux/macOS; guard for environments without it.
    const anyFs = fs as unknown as {
      statfs?: (p: string) => Promise<{
        blocks: number;
        bfree: number;
        bsize: number;
      }>;
    };
    if (!anyFs.statfs) return null;
    const root = process.env.MEDIA_LOCAL_PATH || "/";
    const s = await anyFs.statfs(root);
    const total = s.blocks * s.bsize;
    const free = s.bfree * s.bsize;
    if (total <= 0) return null;
    return ((total - free) / total) * 100;
  } catch {
    return null; // couldn't measure → warn, never a reassuring 0
  }
}

// Media bytes stored, in GB — the number that grows toward R2's 10 GB free tier
// (the thing we'd move TO when local disk gets tight). Summed from the media
// metadata already in the DB (MomentMedia.mediaMeta.byteSize), so no filesystem
// walk and no new tracking.
async function mediaStorageGB(): Promise<number | null> {
  try {
    // byteSize lives in the mediaMeta JSONB (MomentMediaMetaSchema). Sum it in
    // SQL rather than loading every row.
    const rows = await db.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM((("mediaMeta"->>'byteSize'))::bigint) AS total
      FROM "MomentMedia"
      WHERE "mediaMeta" ? 'byteSize'
    `;
    const bytes = Number(rows[0]?.total ?? 0);
    return bytes / 1024 ** 3; // → GB
  } catch {
    return null;
  }
}

// --- the registry ------------------------------------------------------------
//
// Order: the ceilings most likely to bite first, first. Disk is the live
// ceiling today; media bytes is the one trending toward R2; email/Sentry are
// declared now (pending) so they're watched the moment they're wired, per the
// rule "if it can charge you, it's in the registry before it ships."

export const REGISTRY: Metered[] = [
  {
    key: "vps_disk",
    label: "VPS disk",
    unit: "%",
    freeLimit: 100, // percent; the warn line is the real signal
    warnAt: DISK_WARN_PERCENT / 100,
    usage: diskPercentUsed,
    resets: "never",
    note: "A full disk takes Postgres down — the real ceiling while on local storage.",
  },
  {
    key: "media_storage",
    label: "Media storage",
    unit: "GB",
    freeLimit: R2_FREE_GB,
    warnAt: DEFAULT_WARN,
    usage: mediaStorageGB,
    resets: "never",
    note: "Summed from stored media. Trends toward R2's free tier when we move off local disk.",
  },
  {
    key: "email_sends",
    label: "Transactional email",
    unit: "sends/mo",
    freeLimit: EMAIL_FREE,
    warnAt: DEFAULT_WARN,
    usage: async () => null, // not wired yet — see pending
    resets: "monthly",
    pending: true,
    note: "Not wired yet. The tier most likely to cap first once signup verification uses it.",
  },
];

// --- evaluation: one place turns a row + its measurement into a status -------
//
// Shared by the page (renders it) and the cron (alarms on it), so "what counts
// as a warning" is defined ONCE and can't drift between awareness and
// prevention.

export type CostStatus = "ok" | "warn" | "over" | "unknown" | "pending";

export type CostReading = {
  key: string;
  label: string;
  unit: string;
  freeLimit: number;
  warnAtPercent: number; // e.g. 80
  usage: number | null;
  percent: number | null;
  status: CostStatus;
  note?: string;
};

export async function evaluate(row: Metered): Promise<CostReading> {
  const warnAtPercent = Math.round(row.warnAt * 100);
  const base = {
    key: row.key,
    label: row.label,
    unit: row.unit,
    freeLimit: row.freeLimit,
    warnAtPercent,
    note: row.note,
  };

  if (row.pending) {
    return { ...base, usage: null, percent: null, status: "pending" };
  }

  const usage = await row.usage();

  // §4: a failed measurement is a WARN, never green. null → "unknown".
  if (usage === null) {
    return { ...base, usage: null, percent: null, status: "unknown" };
  }

  const percent = row.freeLimit > 0 ? (usage / row.freeLimit) * 100 : 0;
  const status: CostStatus =
    percent >= 100 ? "over" : percent >= warnAtPercent ? "warn" : "ok";

  return { ...base, usage, percent, status };
}

export async function evaluateAll(): Promise<CostReading[]> {
  return Promise.all(REGISTRY.map(evaluate));
}

// A single boolean the cron uses: does anything need a human? Over, warn, and
// unknown all qualify — pending and ok do not.
export function needsAttention(readings: CostReading[]): boolean {
  return readings.some(
    (r) => r.status === "over" || r.status === "warn" || r.status === "unknown",
  );
}
