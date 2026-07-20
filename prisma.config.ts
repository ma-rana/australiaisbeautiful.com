// prisma.config.ts — Prisma 7 configuration.
// In Prisma 7 the datasource connection string is provided HERE (via the
// config), not inline in schema.prisma. This keeps the URL out of the schema
// file and lets it come from the validated environment.
//
// The schema.prisma datasource block only declares `provider = "postgresql"`;
// the actual DATABASE_URL is wired in through this config at runtime.

import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  // Migrations dir + seed command. Prisma 7 reads `seed` for `npx prisma db seed`.
  // tsx runs the TypeScript seed file directly (dev dependency).
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  // The datasource URL comes from the environment. lib/env.ts validates it on
  // app boot; here Prisma reads it directly for migrate/generate.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
