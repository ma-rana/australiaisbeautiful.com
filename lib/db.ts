// lib/db.ts — Prisma singleton.
// REQUIRED: without this, Next.js hot reload creates a new PrismaClient on
// every file change and exhausts the Postgres connection pool. This is the
// #1 production gotcha for Next.js + Prisma.
//
// PRISMA 7: the client is constructed with a DRIVER ADAPTER (PrismaPg), not a
// URL string. The adapter owns the Postgres connection; Prisma talks to it.
// This is the modern Prisma 7 pattern (see the generated client's docs).

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const db =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
