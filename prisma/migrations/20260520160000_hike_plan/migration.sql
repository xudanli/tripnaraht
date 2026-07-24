-- HikePlan 全生命周期（P1）
CREATE TABLE IF NOT EXISTS "hike_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "route_direction_id" INTEGER NOT NULL,
    "trip_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "planned_date" DATE,
    "planned_start_time" TEXT,
    "prep" JSONB,
    "live_state" JSONB,
    "review" JSONB,
    "track_batch_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hike_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "hike_track_point" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hike_plan_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "altitude_m" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "client_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hike_track_point_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hike_plan_user_id_idx" ON "hike_plan"("user_id");
CREATE INDEX IF NOT EXISTS "hike_plan_user_id_status_idx" ON "hike_plan"("user_id", "status");
CREATE INDEX IF NOT EXISTS "hike_plan_route_direction_id_idx" ON "hike_plan"("route_direction_id");
CREATE INDEX IF NOT EXISTS "hike_track_point_hike_plan_id_recorded_at_idx" ON "hike_track_point"("hike_plan_id", "recorded_at");
CREATE INDEX IF NOT EXISTS "hike_track_point_hike_plan_id_client_batch_id_idx" ON "hike_track_point"("hike_plan_id", "client_batch_id");

ALTER TABLE "hike_plan" DROP CONSTRAINT IF EXISTS "hike_plan_route_direction_id_fkey";
ALTER TABLE "hike_plan" ADD CONSTRAINT "hike_plan_route_direction_id_fkey" FOREIGN KEY ("route_direction_id") REFERENCES "RouteDirection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "hike_track_point" DROP CONSTRAINT IF EXISTS "hike_track_point_hike_plan_id_fkey";
ALTER TABLE "hike_track_point" ADD CONSTRAINT "hike_track_point_hike_plan_id_fkey" FOREIGN KEY ("hike_plan_id") REFERENCES "hike_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
