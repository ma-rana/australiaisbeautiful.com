// lib/schemas/location.ts
// Zod schemas for Location JSONB fields. This is the pattern that keeps JSONB
// safe: Postgres stores it as opaque JSON; Zod guarantees the SHAPE on write
// AND read. Never trust a JSONB column's contents without parsing it here.
//
// RULE (CLAUDE.md): if you need to FILTER or SORT by it, it does not belong
// here — promote it to a real column. Everything below is render-only.

import { z } from "zod";

// A single day's opening hours. null = closed that day.
const HoursSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
}).nullable();

export const OpeningHoursSchema = z.object({
  mon: HoursSchema,
  tue: HoursSchema,
  wed: HoursSchema,
  thu: HoursSchema,
  fri: HoursSchema,
  sat: HoursSchema,
  sun: HoursSchema,
  notes: z.string().max(280).optional(),
});

// Location.details — render-only extras for the destination page.
export const LocationDetailsSchema = z.object({
  openingHours: OpeningHoursSchema.optional(),
  bestTimeToVisit: z.string().max(280).optional(),
  accessNotes: z.string().max(1000).optional(),
  facilities: z.array(z.enum([
    "TOILETS",
    "PARKING",
    "CAFE",
    "PICNIC_AREA",
    "WHEELCHAIR_ACCESS",
    "CAMPING",
    "SWIMMING",
    "BBQ",
    "DRINKING_WATER",
    "VISITOR_CENTRE",
  ])).max(20).optional(),
  entryFee: z.object({
    free: z.boolean(),
    note: z.string().max(200).optional(),
  }).optional(),
  // Safety/seasonal warnings (rips, crocodiles, bushfire, closures).
  warnings: z.array(z.string().max(280)).max(10).optional(),
  // Acknowledgement of Traditional Owners for this place, where known.
  // Australia-specific and worth getting right — verify before publishing.
  traditionalOwners: z.string().max(280).optional(),
});
export type LocationDetails = z.infer<typeof LocationDetailsSchema>;

// --- Usage pattern (in a server action / repository) ---
//
// WRITE:
//   const parsed = LocationDetailsSchema.parse(input.details); // throws if bad
//   await db.location.update({ data: { details: parsed }, where: { id } });
//
// READ:
//   const row = await db.location.findFirstOrThrow({ where: { slug } });
//   const details = LocationDetailsSchema.parse(row.details ?? {});
//
// This is what "validate JSONB both directions" means in CLAUDE.md.
