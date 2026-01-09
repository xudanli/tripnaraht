-- CreateTable
CREATE TABLE IF NOT EXISTS "hazard_zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zone_id" VARCHAR(100) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "geom" geography,
    "seasonality" JSONB,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hazard_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "hazard_zones_zone_id_key" ON "hazard_zones"("zone_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazard_zones_country_code_idx" ON "hazard_zones"("country_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazard_zones_type_idx" ON "hazard_zones"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazard_zones_level_idx" ON "hazard_zones"("level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazard_zones_country_code_type_idx" ON "hazard_zones"("country_code", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazard_zones_country_code_level_idx" ON "hazard_zones"("country_code", "level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazard_zones_geom_idx" ON "hazard_zones" USING GIST ("geom");
