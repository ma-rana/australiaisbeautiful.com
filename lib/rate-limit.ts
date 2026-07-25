// lib/rate-limit.ts — in-process sliding-window rate limiter (SECURITY.md §11).
//
// DELIBERATELY DEPENDENCY-FREE. This app is ONE Node process behind PM2 on one
// VPS, so an in-memory Map is correct today: no Redis to run, no network hop,
// nothing to misconfigure. The moment this app runs as multiple instances
// (cluster mode, second box), this file is the ONE place to swap in a shared
// store — the call sites don't change.
//
// Semantics: sliding window. A key may perform `limit` actions per `windowMs`;
// older timestamps age out continuously (no thundering herd at window reset).
//
// Two usage patterns:
//   consume(key, opts)  — count this call. For actions where the attempt itself
//                         is the cost (an upload, a signup).
//   check(key, opts)    — is the key currently over? Does NOT count the call.
//                         Pair with recordFailure() for login flows, where only
//                         FAILURES should count (locking out someone who signs
//                         in successfully ten times is silly, but ten wrong
//                         passwords is an attack).
//   reset(key)          — clear a key (e.g. on successful login).
//
// Memory: entries self-expire on touch, and a periodic sweep evicts idle keys
// so an attacker rotating keys can't grow the Map forever.

export interface RateLimitOptions {
  /** Max actions per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

const buckets = new Map<string, number[]>();

// Survive Next.js dev hot-reload the same way the Prisma singleton does —
// otherwise every recompile silently resets all limits in dev.
const g = globalThis as unknown as { __aibRateBuckets?: Map<string, number[]> };
const store = g.__aibRateBuckets ?? buckets;
if (process.env.NODE_ENV !== "production") g.__aibRateBuckets = store;

function prune(timestamps: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  // Timestamps are appended in order; find the first still-live one.
  let i = 0;
  while (i < timestamps.length && timestamps[i] <= cutoff) i++;
  return i === 0 ? timestamps : timestamps.slice(i);
}

/** Count this call against the key. */
export function consume(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const live = prune(store.get(key) ?? [], now, opts.windowMs);

  if (live.length >= opts.limit) {
    const oldest = live[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
    store.set(key, live);
    return { ok: false, retryAfterSec };
  }

  live.push(now);
  store.set(key, live);
  return { ok: true, remaining: opts.limit - live.length };
}

/** Is the key currently over the limit? Does NOT count the call. */
export function check(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const live = prune(store.get(key) ?? [], now, opts.windowMs);
  store.set(key, live);

  if (live.length >= opts.limit) {
    const oldest = live[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true, remaining: opts.limit - live.length };
}

/** Record one failure against the key (login flows: only failures count). */
export function recordFailure(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  const live = prune(store.get(key) ?? [], now, opts.windowMs);
  live.push(now);
  store.set(key, live);
}

/** Clear a key entirely (e.g. after a successful login). */
export function reset(key: string): void {
  store.delete(key);
}

// --- The platform's named limits, in one place so they're policy, not magic ---
// Tune here, not at call sites.
export const LIMITS = {
  /** Moments created per user. 5 walks in 10 minutes is a human; 50 is a script. */
  UPLOAD: { limit: 5, windowMs: 10 * 60 * 1000 },
  /** Failed password attempts per email. */
  LOGIN_EMAIL: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** New accounts per IP. Five an hour covers a household; fifty is a farm. */
  SIGNUP_IP: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** needs-code probes per IP — it bcrypt-compares, so it's an oracle to protect. */
  NEEDS_CODE_IP: { limit: 20, windowMs: 15 * 60 * 1000 },
  /** Ratings per user — generous; stops only scripted flooding. */
  RATING: { limit: 30, windowMs: 10 * 60 * 1000 },
} as const satisfies Record<string, RateLimitOptions>;

// Periodic sweep so idle keys don't accumulate forever. One hour is plenty:
// every named window above is ≤ 15 minutes.
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const gi = globalThis as unknown as { __aibRateSweep?: ReturnType<typeof setInterval> };
if (!gi.__aibRateSweep) {
  gi.__aibRateSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of store) {
      // Longest named window is 15 min; anything idle past an hour is dead.
      if (ts.length === 0 || ts[ts.length - 1] < now - SWEEP_EVERY_MS) {
        store.delete(key);
      }
    }
  }, SWEEP_EVERY_MS);
  // Don't keep the process alive just to sweep.
  gi.__aibRateSweep.unref?.();
}
