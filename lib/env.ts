// lib/env.ts — validated environment. The app refuses to boot misconfigured.
//
// WHY THIS EXISTS (Phase 0, PLAN.md): a missing or malformed env var should fail
// LOUDLY at startup with a clear message — not silently, three layers deep, as a
// confusing runtime error. The concrete case this prevents: a missing
// DATABASE_URL surfacing as "The datasource.url property is required" from deep
// inside Prisma, or an app that boots "fine" and then 500s on the first request
// because AUTH_SECRET was the example value. One schema, checked once, with an
// error that names exactly what's wrong.
//
// CALIBRATION — required vs optional is deliberate, not lazy:
//   - REQUIRED = the app genuinely cannot function without it (DB, auth secret).
//     A bad/missing value here SHOULD stop the boot; limping on is worse.
//   - OPTIONAL = a real feature depends on it, but the app is coherent without
//     that feature (Google sign-in works only if the Google vars are set; the
//     app without them simply offers email/password only). Over-requiring these
//     would make the app refuse to boot for a feature you haven't set up yet,
//     which is the opposite of helpful.
//
// This is validated but NOT yet imported everywhere — call sites still read
// process.env directly today. The migration to `import { env }` is incremental;
// what matters first is that a misconfigured deploy fails at boot with a good
// message. Import this early (e.g. in instrumentation or a root layout) to force
// the check on startup.

import { z } from "zod";

// A secret that must not still be the placeholder. The example files ship
// obvious sentinels; booting production with them is a real, common mistake.
const PLACEHOLDER_SECRETS = new Set([
  "CHANGE_ME_LONG_RANDOM",
  "CHANGE_ME",
  "changeme",
  "secret",
]);

const EnvSchema = z
  .object({
    // --- Hard-required: the app cannot function without these ---------------
    // The database. Its absence is the #1 boot failure (and the one that bit us
    // on first deploy). Must be a postgres URL.
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine(
        (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
        "DATABASE_URL must be a postgres:// or postgresql:// connection string",
      ),

    // Session signing secret. A short or placeholder value means forgeable
    // sessions — this is security-critical, so we're strict: >=32 chars and not
    // the shipped sentinel.
    AUTH_SECRET: z
      .string()
      .min(32, "AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)")
      .refine(
        (v) => !PLACEHOLDER_SECRETS.has(v),
        "AUTH_SECRET is still the example placeholder — generate a real one",
      ),

    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    // --- Self-hosted Auth.js routing ----------------------------------------
    // Without these two, the /api/auth/* routes don't resolve when self-hosting
    // and you get the "Unexpected token '<'" ClientFetchError (an HTML 404 where
    // JSON was expected). They're only strictly needed in production/self-host,
    // so they're optional here — but if AUTH_URL is set it must be a URL.
    AUTH_URL: z.string().url().optional(),
    AUTH_TRUST_HOST: z.enum(["true", "false"]).optional(),

    // --- App identity / networking ------------------------------------------
    APP_URL: z.string().url().optional(),
    ADMIN_URL: z.string().url().optional(),
    ADMIN_COOKIE_DOMAIN: z.string().optional(),
    // Pinned to 3100 by convention (the VPS has a service on :4000 and Next
    // defaults to :3000). Coerced to a number; defaulted, not required.
    PORT: z.coerce.number().int().positive().default(3100),
    HOST: z.string().default("127.0.0.1"),

    // --- Google OAuth: OPTIONAL (email/password works without it) ------------
    // The app is coherent without Google — it just offers email/password only.
    // Requiring these would make the app refuse to boot for a feature that's
    // genuinely optional. If ONE is set, though, both should be (see superRefine).
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // --- Media storage ------------------------------------------------------
    MEDIA_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    MEDIA_LOCAL_PATH: z.string().optional(), // required only for the local driver (see refine)
    MEDIA_MAX_IMAGE_BYTES: z.coerce.number().int().positive().optional(),
    MEDIA_MAX_VIDEO_BYTES: z.coerce.number().int().positive().optional(),
    // S3/R2 — only when the driver is "s3".
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),

    // --- Maps ---------------------------------------------------------------
    MAP_TILES_URL: z.string().optional(),
    MAP_STYLE_PATH: z.string().optional(),
    MAP_MAX_BOUNDS: z.string().optional(),
    MAP_MIN_ZOOM: z.coerce.number().optional(),

    // --- Cost guards: all optional (lib/cost-guards.ts has defaults) ---------
    R2_FREE_TIER_GB: z.coerce.number().positive().optional(),
    EMAIL_MONTHLY_FREE: z.coerce.number().positive().optional(),
    STORAGE_WARN_PERCENT: z.coerce.number().positive().optional(),
    COST_GUARD_WARN_FRACTION: z.coerce.number().positive().optional(),
    VPS_BANDWIDTH_TB: z.coerce.number().positive().optional(),
    VPS_METRICS_FILE: z.string().optional(),

    // --- Observability ------------------------------------------------------
    SENTRY_DSN: z.string().optional(),
  })
  // Cross-field rules — the "if X then Y" checks a flat schema can't express.
  .superRefine((env, ctx) => {
    // Google: all-or-nothing. One without the other is a half-configured
    // provider that fails confusingly at sign-in time.
    const hasId = Boolean(env.GOOGLE_CLIENT_ID);
    const hasSecret = Boolean(env.GOOGLE_CLIENT_SECRET);
    if (hasId !== hasSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_CLIENT_SECRET"],
        message:
          "Set BOTH GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither. Google sign-in needs both; one alone half-configures the provider.",
      });
    }

    // The local media driver needs a path to write to.
    if (env.MEDIA_STORAGE_DRIVER === "local" && !env.MEDIA_LOCAL_PATH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MEDIA_LOCAL_PATH"],
        message:
          "MEDIA_LOCAL_PATH is required when MEDIA_STORAGE_DRIVER is 'local' (it's where uploads are written).",
      });
    }

    // The s3 driver needs its bucket/credentials.
    if (env.MEDIA_STORAGE_DRIVER === "s3") {
      for (const key of [
        "S3_BUCKET",
        "S3_REGION",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when MEDIA_STORAGE_DRIVER is 's3'.`,
          });
        }
      }
    }

    // In production, self-hosted Auth.js needs AUTH_URL + AUTH_TRUST_HOST or the
    // auth routes silently 404 (the ClientFetchError we hit). Fail at boot, not
    // at first sign-in.
    if (env.NODE_ENV === "production") {
      if (!env.AUTH_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AUTH_URL"],
          message:
            "AUTH_URL is required in production (self-hosted Auth.js won't resolve /api/auth/* without it).",
        });
      }
      if (env.AUTH_TRUST_HOST !== "true") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AUTH_TRUST_HOST"],
          message:
            'AUTH_TRUST_HOST must be "true" in production (behind Nginx, Auth.js has to trust the forwarded host).',
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

// Validate ONCE, at module load. A failure throws with every problem listed,
// each naming the offending var — so a misconfigured boot says exactly what to
// fix instead of dying three layers deep at the first request.
function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Build a readable, one-issue-per-line report. Never print the VALUES (they
    // include secrets) — only the var names and what's wrong.
    const lines = parsed.error.issues.map((i) => {
      const key = i.path.join(".") || "(root)";
      return `  - ${key}: ${i.message}`;
    });
    const msg =
      "Invalid environment configuration — the app cannot start:\n" +
      lines.join("\n") +
      "\n\nFix these in your .env (see .env.example) and restart.";
    // Throwing here stops the boot. In dev this shows in the terminal; in
    // production the process manager (PM2) will surface it in the logs.
    throw new Error(msg);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
