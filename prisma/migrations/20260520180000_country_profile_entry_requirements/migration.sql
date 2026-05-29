-- Global entry requirements by traveler nationality
ALTER TABLE "CountryProfile" ADD COLUMN IF NOT EXISTS "entryRequirements" JSONB;

UPDATE "CountryProfile"
SET "entryRequirements" = jsonb_build_object(
  'byNationality',
  jsonb_build_object('CN', "visaForCN")
)
WHERE "visaForCN" IS NOT NULL
  AND ("entryRequirements" IS NULL OR "entryRequirements" = 'null'::jsonb);
