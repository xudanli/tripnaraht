-- Retire CountryProfile V1: all rows use schemaVersion 2
UPDATE "CountryProfile" SET "schemaVersion" = 2 WHERE "schemaVersion" IS NULL OR "schemaVersion" < 2;

ALTER TABLE "CountryProfile" ALTER COLUMN "schemaVersion" SET DEFAULT 2;
