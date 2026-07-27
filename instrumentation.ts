// instrumentation.ts — runs ONCE when the server starts (Next.js instrumentation
// hook). We use it for exactly one thing: force the environment validation in
// lib/env.ts to run at BOOT, so a misconfigured deploy fails immediately with a
// clear message instead of dying three layers deep on the first request.
//
// Without this, lib/env.ts only validates whenever something first imports it —
// which might be well into handling a request. Importing it here makes the check
// the very first thing that happens, so "the app refuses to boot misconfigured"
// (PLAN.md, Phase 0) is literally true.
//
// RUNTIME GUARD: instrumentation runs in both the Node.js and Edge runtimes, but
// the env check (and everything it guards, like the DB) is Node-only. We import
// lib/env solely in the Node runtime; the Edge runtime skips it.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // The import itself runs loadEnv() and throws on a bad config — which, here
    // at register() time, stops the server from coming up. That's the point.
    await import("@/lib/env");
  }
}
