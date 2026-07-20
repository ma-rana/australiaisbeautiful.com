// lib/db.ts — Prisma singleton.
// REQUIRED: without this, Next.js hot reload creates a new PrismaClient on
// every file change and exhausts the Postgres connection pool. This is the
// #1 production gotcha for Next.js + Prisma.

import { PrismaClient } from "../app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
