-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "RouteDirection" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameCN" TEXT NOT NULL,
    "nameEN" TEXT,
    "description" TEXT,
    "tags" TEXT[],
    "corridorGeom" geography(Geometry, 4326),
    "regions" TEXT[],
    "entryHubs" TEXT[],
    "seasonality" JSONB,
    "constraints" JSONB,
    "riskProfile" JSONB,
    "signaturePois" JSONB,
    "itinerarySkeleton" JSONB,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteDirection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteTemplate" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "routeDirectionId" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "name" TEXT,
    "nameCN" TEXT,
    "nameEN" TEXT,
    "dayPlans" JSONB NOT NULL,
    "defaultPacePreference" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteDirection_uuid_key" ON "RouteDirection"("uuid");

-- CreateIndex
CREATE INDEX "RouteDirection_countryCode_idx" ON "RouteDirection"("countryCode");

-- CreateIndex
CREATE INDEX "RouteDirection_countryCode_isActive_idx" ON "RouteDirection"("countryCode", "isActive");

-- CreateIndex
CREATE INDEX "RouteDirection_tags_idx" ON "RouteDirection" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "RouteTemplate_uuid_key" ON "RouteTemplate"("uuid");

-- CreateIndex
CREATE INDEX "RouteTemplate_routeDirectionId_idx" ON "RouteTemplate"("routeDirectionId");

-- CreateIndex
CREATE INDEX "RouteTemplate_routeDirectionId_durationDays_idx" ON "RouteTemplate"("routeDirectionId", "durationDays");

-- CreateIndex
CREATE INDEX "RouteTemplate_isActive_idx" ON "RouteTemplate"("isActive");

-- AddForeignKey
ALTER TABLE "RouteTemplate" ADD CONSTRAINT "RouteTemplate_routeDirectionId_fkey" FOREIGN KEY ("routeDirectionId") REFERENCES "RouteDirection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

