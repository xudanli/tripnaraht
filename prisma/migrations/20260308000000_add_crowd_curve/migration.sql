-- Travel World Model Phase 6: CrowdCurve 表
-- CreateTable
CREATE TABLE "CrowdCurve" (
    "id" SERIAL NOT NULL,
    "placeId" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "crowdLevel" DOUBLE PRECISION NOT NULL,
    "source" VARCHAR(32) DEFAULT 'estimated',
    "dayOfWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrowdCurve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrowdCurve_placeId_hour_dayOfWeek_key" ON "CrowdCurve"("placeId", "hour", "dayOfWeek");

-- CreateIndex
CREATE INDEX "CrowdCurve_placeId_idx" ON "CrowdCurve"("placeId");

-- AddForeignKey
ALTER TABLE "CrowdCurve" ADD CONSTRAINT "CrowdCurve_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
