-- Migration: Add new fields to City table
-- Created: 2024

-- Add new columns to City table
ALTER TABLE "City" 
  ADD COLUMN IF NOT EXISTS "nameCN" TEXT,
  ADD COLUMN IF NOT EXISTS "nameEN" TEXT,
  ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS "timezone" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS "City_nameCN_idx" ON "City"("nameCN");
CREATE INDEX IF NOT EXISTS "City_nameEN_idx" ON "City"("nameEN");
CREATE INDEX IF NOT EXISTS "City_countryCode_idx" ON "City"("countryCode");
CREATE INDEX IF NOT EXISTS "City_name_idx" ON "City"("name");

-- Add comment to columns
COMMENT ON COLUMN "City"."nameCN" IS '中文名称';
COMMENT ON COLUMN "City"."nameEN" IS '英文名称';
COMMENT ON COLUMN "City"."location" IS 'PostGIS Point（经纬度）';
COMMENT ON COLUMN "City"."timezone" IS '时区（如 "Asia/Shanghai", "America/New_York"）';
COMMENT ON COLUMN "City"."metadata" IS '扩展信息（行政区划、外部ID、其他语言名称等）';

