// prisma/seed.ts — seed the database with real starter locations.
//
// Phase 2 seed: ONE real place to prove the database → page pipeline, and to be
// the very first location an explorer sees. This is Manallack Reserve — a real
// council reserve in Seddon, VIC. Not a landmark; a genuine everyday green space,
// which is exactly the kind of honest local place this product exists to hold.
//
// Run: npx prisma db seed   (configured in prisma.config.ts)
//
// Idempotent: uses upsert on slug, so re-running won't create duplicates.
//
// Runs OUTSIDE Next, so it loads .env itself (dotenv) and constructs the client
// with an explicit URL (Prisma 7 requires it).

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  await db.location.upsert({
    where: { slug: "manallack-reserve-seddon" },
    update: {},
    create: {
      slug: "manallack-reserve-seddon",
      name: "Manallack Reserve",
      // Honest, human intro — "what should someone know before they go",
      // not marketing copy. The real value of a place like this is that it's
      // a low-friction local pocket of green, and saying so plainly is the point.
      intro:
        "A small council-managed reserve in the backstreets of Seddon — the kind of everyday suburban green space you go to for a walk, a quick run, to let the kids ride, or to give the dog a stretch after work. Not a destination you'd drive across town for, but a genuinely useful pocket of open space if you're nearby.",
      category: "OTHER", // no perfect fit in v1 categories; a plain local reserve
      status: "APPROVED", // seeded content is public immediately
      // Approx coordinates for Seddon VIC 3011 (near Hyde St). Refine with the
      // real pin later — the geog column updates itself via the trigger.
      latitude: -37.807,
      longitude: 144.892,
      state: "VIC",
      suburb: "Seddon",
      address: "Hyde St, Seddon VIC 3011",
      details: {
        facilities: ["PARKING"],
        bestTimeToVisit:
          "After work on a weekday is quiet; weekends bring local families and dogs.",
        entryFee: { free: true },
      },
    },
  });

  console.log("Seeded: Manallack Reserve, Seddon VIC");
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
