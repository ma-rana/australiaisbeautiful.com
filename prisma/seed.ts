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
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  // A real admin account you can log in with (email/password). Replaces the
  // former dev-actor now that auth is real. Change the password after first
  // login on any real deployment. Local dev credentials:
  //   email:    admin@localhost
  //   password: admin1234
  const adminHash = await bcrypt.hash("admin1234", 10);
  await db.user.upsert({
    where: { id: "dev-admin" },
    update: { password: adminHash, role: "ADMIN", status: "ACTIVE" },
    create: {
      id: "dev-admin",
      email: "admin@localhost",
      password: adminHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const location = await db.location.upsert({
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

  // A seeded MOMENT with two placeholder photos, so we can build and see the
  // moment grid + full-screen viewer against real data. These are PLACEHOLDERS
  // (SVG) — the real park photos come later through the actual upload flow.
  //
  // Only seed the moment if this location has none yet (keeps re-runs idempotent).
  const existingMoments = await db.moment.count({
    where: { locationId: location.id },
  });

  if (existingMoments === 0) {
    const moment = await db.moment.create({
      data: {
        locationId: location.id,
        // No userId: a seeded moment has no contributor account. In the app,
        // real moments carry a private userId; here it's null (SetNull-friendly).
        type: "PHOTO",
        status: "APPROVED",
        isPublic: true,
        caption:
          "Late afternoon at the reserve — quiet on a weekday, good light through the trees near the Hyde St end. Parking's easy on the street.",
        media: {
          create: [
            {
              position: 0,
              // Storage KEY, not a URL. For local dev these placeholders live
              // in /public/media/seed/, so the key doubles as the public path.
              mediaKey: "/media/seed/manallack-1.svg",
              thumbKey: "/media/seed/manallack-1.svg",
              status: "APPROVED",
              mediaMeta: {
                width: 1200,
                height: 800,
                byteSize: 1000,
                mimeType: "image/webp", // placeholder value; real uploads set this
                exifStripped: true,
              },
            },
            {
              position: 1,
              mediaKey: "/media/seed/manallack-2.svg",
              thumbKey: "/media/seed/manallack-2.svg",
              status: "APPROVED",
              mediaMeta: {
                width: 1200,
                height: 800,
                byteSize: 1000,
                mimeType: "image/webp",
                exifStripped: true,
              },
            },
          ],
        },
      },
      include: { media: true },
    });

    // Set the location's hero to the first photo of this moment.
    await db.location.update({
      where: { id: location.id },
      data: { heroMediaId: moment.media[0].id },
    });

    console.log(`Seeded a moment with ${moment.media.length} photos.`);
  }

  // A couple of PENDING moments, so the moderation queue has something to review.
  // These simulate real submissions awaiting a decision. Idempotent-ish: only
  // seeded if there are currently no pending moments.
  const pendingCount = await db.moment.count({
    where: { locationId: location.id, status: "PENDING" },
  });

  if (pendingCount === 0) {
    await db.moment.create({
      data: {
        locationId: location.id,
        type: "PHOTO",
        status: "PENDING", // awaiting moderation
        isPublic: true,
        caption:
          "Took the dog here Sunday morning — busier than I expected, lots of families. The grass near the north end was a bit muddy after the rain.",
        media: {
          create: [
            {
              position: 0,
              mediaKey: "/media/seed/manallack-1.svg",
              thumbKey: "/media/seed/manallack-1.svg",
              status: "PENDING",
              mediaMeta: {
                width: 1200,
                height: 800,
                byteSize: 1000,
                mimeType: "image/webp",
                exifStripped: true,
              },
            },
          ],
        },
      },
    });

    await db.moment.create({
      data: {
        locationId: location.id,
        type: "PHOTO",
        status: "PENDING",
        isPublic: true,
        caption:
          "Evening walk. Nice light but honestly not much here — it's a small local park, not a destination.",
        media: {
          create: [
            {
              position: 0,
              mediaKey: "/media/seed/manallack-2.svg",
              thumbKey: "/media/seed/manallack-2.svg",
              status: "PENDING",
              mediaMeta: {
                width: 1200,
                height: 800,
                byteSize: 1000,
                mimeType: "image/webp",
                exifStripped: true,
              },
            },
          ],
        },
      },
    });

    console.log("Seeded 2 pending moments for the moderation queue.");
  }

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
