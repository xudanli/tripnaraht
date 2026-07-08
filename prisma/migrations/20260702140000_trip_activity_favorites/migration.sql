-- Trip detail activities tab — per-user favorites
CREATE TABLE "trip_activity_favorites" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_key" VARCHAR(128) NOT NULL,
    "itinerary_item_id" TEXT,
    "place_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_activity_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_activity_favorites_trip_id_user_id_target_key_key"
    ON "trip_activity_favorites"("trip_id", "user_id", "target_key");

CREATE INDEX "trip_activity_favorites_trip_id_user_id_idx"
    ON "trip_activity_favorites"("trip_id", "user_id");

ALTER TABLE "trip_activity_favorites"
    ADD CONSTRAINT "trip_activity_favorites_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
