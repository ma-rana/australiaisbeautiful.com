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
import path from "node:path";
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
  /** For rows fed by an external cron file: when true, an ABSENT feed reads as
   *  "awaiting feed" (pending, no alarm) rather than "unknown" (alarm). The feed
   *  going STALE after it existed is still a real "unknown" (see readMetricsFile).
   *  Distinguishes "you haven't set up the cron yet" from "the cron broke". */
  externalFeed?: boolean;
  /** When usage() returns null for a STRUCTURAL reason (e.g. statfs missing on
   *  Windows dev) rather than a real failure, this explains why — so the page
   *  can say "not measurable here" instead of an alarming "check needed". Only
   *  set this for genuinely-benign unmeasurability, never to hide a real fault. */
  unmeasurableReason?: () => string | null;
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
// Bandwidth cap from the VPS plan (Hostinger shows this on the VPS overview).
// Measured in TB/month to match how the plan is sold.
const BANDWIDTH_TB = num(process.env.VPS_BANDWIDTH_TB, 8);
// Where the VPS-side cron writes its metrics. The app only ever READS this file
// — it never holds a Hostinger token or calls the API itself (blast-radius: the
// internet-facing app must not carry a credential that can reboot/restore the
// box). See scripts/README or docs for the cron that writes it.
const METRICS_FILE =
  process.env.VPS_METRICS_FILE || "/var/www/australiaisbeautiful.com/tmp/vps-metrics.json";
// A feed older than this is STALE — the cron stopped, which is a real "unknown"
// worth alarming on (a silently-dead feed is exactly §4's failure mode).
const METRICS_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h (cron runs more often)

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

// The VPS metrics feed, written by a cron ON THE BOX (see the cron script the
// docs describe). The app READS this file; it never calls Hostinger or holds a
// token — keeping the privileged capability (which can reboot/restore the VPS)
// out of the internet-facing process. Shape written by the cron:
//   { "updatedAt": "2026-07-28T12:00:00Z", "bandwidthTB": 0.002 }
//
// Three outcomes, each meaningful:
//   - file ABSENT      → the cron isn't set up yet. An externalFeed row treats
//                        this as pending (no alarm).
//   - file STALE       → the cron DIED. A real §4 "unknown" — alarm, because a
//                        dead feed hides a real limit.
//   - fresh + parseable → the value.
type MetricsRead =
  | { kind: "absent" }
  | { kind: "stale" }
  | { kind: "ok"; data: Record<string, unknown> };

async function readMetricsFile(): Promise<MetricsRead> {
  const target = path.resolve(METRICS_FILE);
  try {
    const raw = await fs.readFile(target, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const updatedAt = Date.parse(String(data.updatedAt ?? ""));
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt > METRICS_MAX_AGE_MS) {
      return { kind: "stale" };
    }
    return { kind: "ok", data };
  } catch (e) {
    // ENOENT = the cron hasn't written it yet (absent, benign). A file that
    // EXISTS but won't read/parse is more like stale — something's there and we
    // can't trust it — so escalate only when the path actually exists.
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { kind: "absent" };
    try {
      await fs.stat(target);
      return { kind: "stale" };
    } catch {
      return { kind: "absent" };
    }
  }
}

// Bandwidth used this month, in TB, from the metrics feed. Absent/stale → null;
// evaluate() interprets which one via the externalFeed flag + a re-read.
async function bandwidthTB(): Promise<number | null> {
  const read = await readMetricsFile();
  if (read.kind !== "ok") return null;
  const v = Number(read.data.bandwidthTB);
  return Number.isFinite(v) ? v : null;
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
    // On Windows dev, statfs is unavailable — say so plainly, so a local
    // "unknown" reads as "can't measure here", not "something's broken". On the
    // VPS (Linux) this returns null and a real null there IS a genuine unknown.
    unmeasurableReason: () =>
      (fs as unknown as { statfs?: unknown }).statfs
        ? null
        : "not measurable in this environment (Linux-only) — real on the VPS",
    note: "A full disk takes Postgres down — the real ceiling while on local storage.",
  },
  {
    key: "media_storage",
    label: "Uploaded media size",
    unit: "GB",
    freeLimit: R2_FREE_GB,
    warnAt: DEFAULT_WARN,
    usage: mediaStorageGB,
    resets: "never",
    note: "Total size of all uploaded photos, summed from the database. Trends toward R2's free tier when media moves off local disk.",
  },
  {
    key: "bandwidth",
    label: "VPS bandwidth",
    unit: "TB/mo",
    freeLimit: BANDWIDTH_TB,
    warnAt: DEFAULT_WARN,
    usage: bandwidthTB,
    resets: "monthly",
    externalFeed: true, // fed by the on-box cron; absent feed = awaiting, not alarm
    note: "Monthly data served by the VPS, against the plan's cap. Fed by an on-box cron (the app never calls Hostinger or holds its token).",
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

export type CostStatus = "ok" | "warn" | "over" | "unknown" | "pending" | "awaiting";

export type CostReading = {
  key: string;
  label: string;
  unit: string;
  freeLimit: number;
  warnAtPercent: number; // e.g. 80
  usage: number | null;
  percent: number | null;
  status: CostStatus;
  /** Extra human context for the non-numeric states — e.g. WHY it's unknown
   *  ("not measurable here") or what "awaiting" is waiting for. */
  detail?: string;
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

  if (usage === null) {
    // An external-feed row distinguishes "not set up yet" from "the feed died".
    if (row.externalFeed) {
      const read = await readMetricsFile();
      if (read.kind === "absent") {
        return {
          ...base,
          usage: null,
          percent: null,
          status: "awaiting",
          detail: "awaiting the on-box metrics feed (cron not set up yet)",
        };
      }
      // stale (or present-but-unusable) → a real §4 unknown: the feed broke.
      return {
        ...base,
        usage: null,
        percent: null,
        status: "unknown",
        detail: "metrics feed is stale — the on-box cron may have stopped",
      };
    }

    // A structurally-unmeasurable row (e.g. statfs on Windows) says so, and does
    // NOT alarm — it's a benign "can't measure here", not a broken guard. On the
    // VPS the reason function returns null, so a real null there stays a true
    // "unknown" that DOES alarm (§4).
    const reason = row.unmeasurableReason?.() ?? null;
    if (reason) {
      return {
        ...base,
        usage: null,
        percent: null,
        status: "awaiting",
        detail: reason,
      };
    }

    // §4: a genuine failed measurement is a WARN, never green. null → "unknown".
    return {
      ...base,
      usage: null,
      percent: null,
      status: "unknown",
      detail: "couldn't measure — check needed",
    };
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
// a genuine unknown all qualify. "pending" (not wired) and "awaiting" (feed not
// set up, or not measurable in this environment) do NOT — those are known,
// benign not-yet states, not silent failures.
export function needsAttention(readings: CostReading[]): boolean {
  return readings.some(
    (r) => r.status === "over" || r.status === "warn" || r.status === "unknown",
  );
}
