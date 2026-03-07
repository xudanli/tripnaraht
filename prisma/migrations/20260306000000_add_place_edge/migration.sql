-- Travel World Model Phase 2: PlaceEdge 表
CREATE TABLE "PlaceEdge" (
    "id" SERIAL NOT NULL,
    "fromPlaceId" INTEGER NOT NULL,
    "toPlaceId" INTEGER NOT NULL,
    "distanceM" INTEGER,
    "walkTimeMin" INTEGER,
    "transitTimeMin" INTEGER,
    "experienceTransition" VARCHAR(64),
    "source" VARCHAR(32) DEFAULT 'computed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaceEdge_fromPlaceId_toPlaceId_key" ON "PlaceEdge"("fromPlaceId", "toPlaceId");
CREATE INDEX "PlaceEdge_fromPlaceId_idx" ON "PlaceEdge"("fromPlaceId");
CREATE INDEX "PlaceEdge_toPlaceId_idx" ON "PlaceEdge"("toPlaceId");

ALTER TABLE "PlaceEdge" ADD CONSTRAINT "PlaceEdge_fromPlaceId_fkey" FOREIGN KEY ("fromPlaceId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceEdge" ADD CONSTRAINT "PlaceEdge_toPlaceId_fkey" FOREIGN KEY ("toPlaceId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
