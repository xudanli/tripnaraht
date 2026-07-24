-- F3: 徒步路线收藏（跨设备）
CREATE TABLE IF NOT EXISTS "hike_trail_bookmark" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "route_direction_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hike_trail_bookmark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hike_trail_bookmark_user_id_route_direction_id_key"
    ON "hike_trail_bookmark"("user_id", "route_direction_id");

CREATE INDEX IF NOT EXISTS "hike_trail_bookmark_user_id_idx"
    ON "hike_trail_bookmark"("user_id");

ALTER TABLE "hike_trail_bookmark"
    ADD CONSTRAINT "hike_trail_bookmark_route_direction_id_fkey"
    FOREIGN KEY ("route_direction_id") REFERENCES "RouteDirection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
