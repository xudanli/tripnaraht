-- Travel World Model Phase 3: District 表 + Place.districtId
-- CreateTable
CREATE TABLE "District" (
    "id" SERIAL NOT NULL,
    "cityId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameCN" TEXT,
    "nameEN" TEXT,
    "center" geography(Point, 4326),
    "radiusM" INTEGER,
    "dominantExperience" VARCHAR(64),
    "vibe" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- Add districtId to Place
ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS "districtId" INTEGER;

-- CreateIndex
CREATE INDEX "District_cityId_idx" ON "District"("cityId");

-- CreateIndex
CREATE INDEX "Place_districtId_idx" ON "Place"("districtId");

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Place" ADD CONSTRAINT "Place_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;
