-- CountryProfile V2: algorithm-ready fields
ALTER TABLE "CountryProfile" ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CountryProfile" ADD COLUMN IF NOT EXISTS "timeBoundaries" JSONB;
