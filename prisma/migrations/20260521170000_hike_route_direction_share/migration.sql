CREATE TABLE IF NOT EXISTS "hike_route_direction_share" (
    "id" UUID NOT NULL,
    "route_direction_id" INTEGER NOT NULL,
    "created_by_user_id" UUID,
    "share_token" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEW',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hike_route_direction_share_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hike_route_direction_share_share_token_key"
    ON "hike_route_direction_share"("share_token");

CREATE INDEX IF NOT EXISTS "hike_route_direction_share_route_direction_id_idx"
    ON "hike_route_direction_share"("route_direction_id");

ALTER TABLE "hike_route_direction_share"
    ADD CONSTRAINT "hike_route_direction_share_route_direction_id_fkey"
    FOREIGN KEY ("route_direction_id") REFERENCES "RouteDirection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
