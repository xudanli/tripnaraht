-- POI Access & Capacity Engine — rules, inventory, crowding, overrides, execution feedback

CREATE TABLE IF NOT EXISTS "poi_access_rules" (
    "id" VARCHAR(191) NOT NULL,
    "poi_id" VARCHAR(191) NOT NULL,
    "place_id" INTEGER,
    "rule_type" VARCHAR(64) NOT NULL,
    "target_resource" VARCHAR(32) NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "daily_start_time" VARCHAR(5),
    "daily_end_time" VARCHAR(5),
    "quota" INTEGER,
    "reservation_required" BOOLEAN,
    "applicable_vehicle_types" JSONB,
    "status" VARCHAR(32) NOT NULL,
    "source_authority" VARCHAR(255) NOT NULL,
    "source_url" VARCHAR(1024),
    "source_updated_at" TIMESTAMPTZ(6),
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "confidence" VARCHAR(16) NOT NULL,
    "enforcement" VARCHAR(16) NOT NULL DEFAULT 'HARD',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poi_access_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "poi_access_rules_poi_id_status_idx"
    ON "poi_access_rules"("poi_id", "status");
CREATE INDEX IF NOT EXISTS "poi_access_rules_place_id_idx"
    ON "poi_access_rules"("place_id");

DO $$ BEGIN
    ALTER TABLE "poi_access_rules"
        ADD CONSTRAINT "poi_access_rules_place_id_fkey"
        FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "poi_capacity_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poi_id" VARCHAR(191) NOT NULL,
    "place_id" INTEGER,
    "date_iso" VARCHAR(10) NOT NULL,
    "slot_start_time" VARCHAR(5),
    "slot_end_time" VARCHAR(5),
    "remaining" INTEGER,
    "capacity" INTEGER,
    "sold_out" BOOLEAN NOT NULL DEFAULT false,
    "signal_source" VARCHAR(32) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "confidence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poi_capacity_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "poi_capacity_snapshots_poi_id_date_iso_idx"
    ON "poi_capacity_snapshots"("poi_id", "date_iso");
CREATE INDEX IF NOT EXISTS "poi_capacity_snapshots_place_id_date_iso_idx"
    ON "poi_capacity_snapshots"("place_id", "date_iso");

DO $$ BEGIN
    ALTER TABLE "poi_capacity_snapshots"
        ADD CONSTRAINT "poi_capacity_snapshots_place_id_fkey"
        FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "poi_crowding_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poi_id" VARCHAR(191) NOT NULL,
    "place_id" INTEGER,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "parking_occupancy_ratio" DOUBLE PRECISION,
    "booking_remaining" INTEGER,
    "booking_capacity" INTEGER,
    "arrival_rate_per_hour" DOUBLE PRECISION,
    "predicted_wait_p50" INTEGER,
    "predicted_wait_p90" INTEGER,
    "crowd_level" VARCHAR(16) NOT NULL,
    "signal_sources" JSONB NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poi_crowding_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "poi_crowding_snapshots_poi_id_observed_at_idx"
    ON "poi_crowding_snapshots"("poi_id", "observed_at");
CREATE INDEX IF NOT EXISTS "poi_crowding_snapshots_place_id_observed_at_idx"
    ON "poi_crowding_snapshots"("place_id", "observed_at");

DO $$ BEGIN
    ALTER TABLE "poi_crowding_snapshots"
        ADD CONSTRAINT "poi_crowding_snapshots_place_id_fkey"
        FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "poi_access_status_overrides" (
    "id" VARCHAR(191) NOT NULL,
    "poi_id" VARCHAR(191) NOT NULL,
    "place_id" INTEGER,
    "rule_type" VARCHAR(64) NOT NULL,
    "target_resource" VARCHAR(32) NOT NULL,
    "enforcement" VARCHAR(16) NOT NULL DEFAULT 'HARD',
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "status" VARCHAR(32) NOT NULL,
    "source_authority" VARCHAR(255) NOT NULL,
    "source_url" VARCHAR(1024),
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "confidence" VARCHAR(16) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poi_access_status_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "poi_access_status_overrides_poi_id_status_effective_from_idx"
    ON "poi_access_status_overrides"("poi_id", "status", "effective_from");
CREATE INDEX IF NOT EXISTS "poi_access_status_overrides_place_id_idx"
    ON "poi_access_status_overrides"("place_id");

DO $$ BEGIN
    ALTER TABLE "poi_access_status_overrides"
        ADD CONSTRAINT "poi_access_status_overrides_place_id_fkey"
        FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "poi_execution_feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poi_id" VARCHAR(191) NOT NULL,
    "place_id" INTEGER,
    "trip_id" VARCHAR(191),
    "date_iso" VARCHAR(10) NOT NULL,
    "arrival_time" VARCHAR(5),
    "parking_wait_min" INTEGER,
    "visit_duration_min" INTEGER,
    "could_not_park" BOOLEAN NOT NULL DEFAULT false,
    "abandoned_due_to_crowd" BOOLEAN NOT NULL DEFAULT false,
    "crowd_level_subjective" VARCHAR(16),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poi_execution_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "poi_execution_feedbacks_poi_id_date_iso_idx"
    ON "poi_execution_feedbacks"("poi_id", "date_iso");
CREATE INDEX IF NOT EXISTS "poi_execution_feedbacks_trip_id_idx"
    ON "poi_execution_feedbacks"("trip_id");

DO $$ BEGIN
    ALTER TABLE "poi_execution_feedbacks"
        ADD CONSTRAINT "poi_execution_feedbacks_place_id_fkey"
        FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
