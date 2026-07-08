-- Trip Attraction Explore — persisted candidate shortlist per trip
CREATE TABLE "trip_attraction_explore_candidates" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "place_id" INTEGER NOT NULL,
    "priority" VARCHAR(32) NOT NULL DEFAULT 'very_interested',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "source_ref" JSONB,
    "added_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_attraction_explore_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_attraction_explore_candidates_trip_id_place_id_key"
    ON "trip_attraction_explore_candidates"("trip_id", "place_id");

CREATE INDEX "trip_attraction_explore_candidates_trip_id_sort_order_idx"
    ON "trip_attraction_explore_candidates"("trip_id", "sort_order");

ALTER TABLE "trip_attraction_explore_candidates"
    ADD CONSTRAINT "trip_attraction_explore_candidates_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trip_attraction_explore_candidates"
    ADD CONSTRAINT "trip_attraction_explore_candidates_place_id_fkey"
    FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
