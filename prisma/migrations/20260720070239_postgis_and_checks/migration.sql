-- Manual migration: PostGIS geography columns + Rating CHECK constraint
--
-- These are the two things Prisma's schema cannot express natively (flagged in
-- schema.prisma comments), added here by hand:
--   1. A geography(Point, 4326) column on "Location" and "LocationRequestCluster"
--      for radius / nearest-neighbour search (near-me, request clustering, map).
--      The lat/lng Float columns remain the render source of truth; this column
--      is the spatial INDEX, kept in sync via a trigger.
--   2. A CHECK (score BETWEEN 1 AND 5) on "Rating" — belt-and-braces with the
--      Zod validation, because the cached ratingAvg is only as trustworthy as
--      the rows behind it.
--
-- Requires the PostGIS extension. Enabled here as the FIRST step so this
-- migration is self-contained: the shadow database Prisma uses to verify
-- migrations is fresh and does NOT have PostGIS, so the migration must enable
-- it itself, not rely on it being pre-enabled. IF NOT EXISTS makes it a no-op
-- where PostGIS is already on (the real aib database).

-- =========================================================================
-- 0. Ensure PostGIS is available (needed by the shadow DB and any fresh DB)
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- =========================================================================
-- 1. PostGIS geography column on "Location"
-- =========================================================================

-- Add the geography column (nullable at first so existing rows don't block it).
ALTER TABLE "Location"
  ADD COLUMN IF NOT EXISTS "geog" geography(Point, 4326);

-- Backfill from existing lat/lng (none yet, but correct for any that exist).
UPDATE "Location"
  SET "geog" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
  WHERE "geog" IS NULL;

-- Spatial index — this is what makes ST_DWithin radius queries fast.
CREATE INDEX IF NOT EXISTS "Location_geog_idx"
  ON "Location" USING GIST ("geog");

-- Keep geog in sync with lat/lng automatically on insert/update.
CREATE OR REPLACE FUNCTION "location_sync_geog"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."geog" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "location_geog_trigger" ON "Location";
CREATE TRIGGER "location_geog_trigger"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "Location"
  FOR EACH ROW
  EXECUTE FUNCTION "location_sync_geog"();

-- =========================================================================
-- 2. PostGIS geography column on "LocationRequestCluster"
-- =========================================================================

ALTER TABLE "LocationRequestCluster"
  ADD COLUMN IF NOT EXISTS "geog" geography(Point, 4326);

UPDATE "LocationRequestCluster"
  SET "geog" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
  WHERE "geog" IS NULL;

CREATE INDEX IF NOT EXISTS "LocationRequestCluster_geog_idx"
  ON "LocationRequestCluster" USING GIST ("geog");

CREATE OR REPLACE FUNCTION "cluster_sync_geog"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."geog" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "cluster_geog_trigger" ON "LocationRequestCluster";
CREATE TRIGGER "cluster_geog_trigger"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "LocationRequestCluster"
  FOR EACH ROW
  EXECUTE FUNCTION "cluster_sync_geog"();

-- =========================================================================
-- 3. Rating score CHECK constraint (1..5)
-- =========================================================================

ALTER TABLE "Rating"
  ADD CONSTRAINT "Rating_score_range" CHECK ("score" >= 1 AND "score" <= 5);

-- =========================================================================
-- NOTES for querying (application code, raw SQL):
--   Radius search (locations within N metres of a point):
--     SELECT * FROM "Location"
--     WHERE ST_DWithin("geog",
--       ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography, $metres)
--       AND "status" = 'APPROVED';
--
--   Nearest N:
--     SELECT *, ST_Distance("geog",
--       ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography) AS dist
--     FROM "Location" WHERE "status" = 'APPROVED'
--     ORDER BY "geog" <-> ST_SetSRID(ST_MakePoint($lng,$lat),4326)::geography
--     LIMIT $n;
--
--   Prisma doesn't know about "geog" — use $queryRaw for these. Prisma's normal
--   queries still work for everything else; geog is invisible to them, which is
--   fine (it's maintained by the triggers above, not by Prisma).
-- =========================================================================
