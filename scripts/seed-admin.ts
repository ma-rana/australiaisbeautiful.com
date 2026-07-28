// scripts/seed-admin.ts — create the FIRST admin account, and nothing else.
//
// WHY THIS EXISTS: the main prisma/seed.ts also creates demo content (a sample
// location, moments, a pending queue) and uses well-known dev passwords — fine
// for local dev, WRONG for production. Production wants exactly one thing seeded:
// a single admin you can log in with, because admins can't be created through
// the UI (the bootstrap problem — ADMIN.md §4). No demo location, no explorer
// account, no weak hardcoded password.
//
// CREDENTIALS COME FROM THE ENVIRONMENT, never hardcoded — so nothing sensitive
// is committed and each deployment sets its own:
//   SEED_ADMIN_EMAIL     — the admin's email
//   SEED_ADMIN_PASSWORD  — the admin's password (min 12 chars, enforced below)
//
// Run (on the VPS, with those two vars set for the command only):
//   SEED_ADMIN_EMAIL="you@example.com" SEED_ADMIN_PASSWORD="a-long-strong-one" \
//     npx tsx scripts/seed-admin.ts
//
// Idempotent: upserts on email, so re-running updates that admin rather than
// creating duplicates. Safe to run more than once.

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const email = process.env.SEED_ADMIN_EMAIL?.trim();
const password = process.env.SEED_ADMIN_PASSWORD;

// Fail loudly and helpfully if the credentials aren't provided — never fall back
// to a default password (that's exactly the weak-credential trap we're avoiding).
if (!email || !password) {
  console.error(
    "\nMissing admin credentials. Set both and re-run:\n" +
      '  SEED_ADMIN_EMAIL="you@example.com" \\\n' +
      '  SEED_ADMIN_PASSWORD="a-long-strong-password" \\\n' +
      "  npx tsx scripts/seed-admin.ts\n",
  );
  process.exit(1);
}

// Basic sanity: a real email, and a password long enough to not be trivially
// weak. Not trying to be a full validator — just refusing the obvious mistakes.
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`SEED_ADMIN_EMAIL doesn't look like an email: ${email}`);
  process.exit(1);
}
if (password.length < 12) {
  console.error(
    `SEED_ADMIN_PASSWORD is too short (${password.length} chars). Use at least 12.`,
  );
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash(password!, 12);

  const admin = await db.user.upsert({
    where: { email: email! },
    update: {
      // Re-running resets THIS admin's password/role/status — useful if you
      // ever need to recover access. It won't touch any other account.
      password: hash,
      role: "ADMIN",
      status: "ACTIVE",
    },
    create: {
      email: email!,
      password: hash,
      role: "ADMIN",
      status: "ACTIVE",
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  console.log(`\n✓ Admin ready: ${admin.email} (role ${admin.role})`);
  console.log("  You can now sign in at the admin door.\n");
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
