/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// vitest.config.ts — the test runner.
//
// Node environment (not jsdom): everything under test here is server-side
// security logic — the auth guards, visibility predicates, TOTP, the rate
// limiter. No DOM. Component tests, if they ever come, get their own project
// with an environment override; we don't pay for jsdom on pure-logic suites.
//
// The @/ alias is resolved here to mirror tsconfig.json's "@/* -> repo root",
// so tests import exactly what the app imports (@/lib/auth, not ../lib/auth).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each suite that touches the in-memory rate limiter or the mocked db
    // resets its own state in beforeEach; no global setup needed yet.
    clearMocks: true,
  },
});
