// tests/rate-limit.test.ts — the sliding-window limiter (SECURITY.md §11,
// PLAN.md Phase 2: "Rate limits: upload, signup, login").
//
// The limiter guards signup, login, upload and the needs-code oracle, so its
// two behavioural distinctions are the ones that matter and are easy to get
// wrong:
//   - consume() counts every call (the attempt IS the cost: an upload).
//   - check()+recordFailure() count only FAILURES (ten good logins is fine;
//     ten wrong passwords is an attack).
// Time is controlled with fake timers so the window's aging-out is tested
// deterministically rather than with sleeps.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  consume,
  check,
  recordFailure,
  reset,
  type RateLimitOptions,
} from "@/lib/rate-limit";

const opts: RateLimitOptions = { limit: 3, windowMs: 1000 };

// Unique key per test so suites don't bleed into each other through the
// shared in-memory store.
let n = 0;
const key = () => `test-key-${n++}`;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("consume — counts every call", () => {
  it("allows up to the limit, then blocks", () => {
    const k = key();
    expect(consume(k, opts).ok).toBe(true); // 1
    expect(consume(k, opts).ok).toBe(true); // 2
    expect(consume(k, opts).ok).toBe(true); // 3
    const blocked = consume(k, opts); // 4
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("reports remaining as it fills", () => {
    const k = key();
    const r1 = consume(k, opts);
    if (r1.ok) expect(r1.remaining).toBe(2);
    const r2 = consume(k, opts);
    if (r2.ok) expect(r2.remaining).toBe(1);
    const r3 = consume(k, opts);
    if (r3.ok) expect(r3.remaining).toBe(0);
  });

  it("ages out old timestamps as the window slides", () => {
    const k = key();
    consume(k, opts);
    consume(k, opts);
    consume(k, opts);
    expect(consume(k, opts).ok).toBe(false); // full

    // Advance past the window; all three should have aged out.
    vi.advanceTimersByTime(1001);
    expect(consume(k, opts).ok).toBe(true);
  });

  it("partial aging frees exactly the expired slots", () => {
    const k = key();
    consume(k, opts); // t=0
    vi.advanceTimersByTime(600);
    consume(k, opts); // t=600
    consume(k, opts); // t=600 → full
    expect(consume(k, opts).ok).toBe(false);

    // At t=1001 only the first (t=0) has expired → exactly one slot frees.
    vi.advanceTimersByTime(401); // now t=1001
    expect(consume(k, opts).ok).toBe(true); // the freed slot
    expect(consume(k, opts).ok).toBe(false); // and full again
  });
});

describe("check + recordFailure — only failures count (login flow)", () => {
  it("check alone never consumes — a successful login isn't a strike", () => {
    const k = key();
    for (let i = 0; i < 10; i++) expect(check(k, opts).ok).toBe(true);
  });

  it("recordFailure accumulates toward the limit", () => {
    const k = key();
    recordFailure(k, opts);
    recordFailure(k, opts);
    expect(check(k, opts).ok).toBe(true); // 2 failures < 3
    recordFailure(k, opts);
    expect(check(k, opts).ok).toBe(false); // 3 failures → locked
  });

  it("reset clears a key (as on a successful login after some failures)", () => {
    const k = key();
    recordFailure(k, opts);
    recordFailure(k, opts);
    recordFailure(k, opts);
    expect(check(k, opts).ok).toBe(false);
    reset(k);
    expect(check(k, opts).ok).toBe(true);
  });
});

describe("keys are independent", () => {
  it("exhausting one key does not affect another", () => {
    const a = key();
    const b = key();
    consume(a, opts);
    consume(a, opts);
    consume(a, opts);
    expect(consume(a, opts).ok).toBe(false);
    expect(consume(b, opts).ok).toBe(true);
  });
});
