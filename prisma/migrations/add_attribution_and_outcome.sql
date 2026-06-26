-- Migration: Add Decision Attribution column and Travel Outcomes table
-- Generated for P0 (Decision Attribution Engine) + P1 (Travel Outcome Model)
-- Safe to run multiple times (uses IF NOT EXISTS)

-- 1. Add attribution column to travel_events table (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'travel_events') THEN
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'travel_events' AND column_name = 'attribution'
    ) THEN
      ALTER TABLE "travel_events" ADD COLUMN "attribution" JSONB;
    END IF;
  END IF;
END $$;

-- 2. Create travel_events table (if not exists - for fresh environments)
CREATE TABLE IF NOT EXISTS "travel_events" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "segment" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "attribution" JSONB,
    CONSTRAINT "travel_events_pkey" PRIMARY KEY ("id")
);

-- 3. Create unique index on idempotency_key (if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "travel_events_idempotency_key_key"
  ON "travel_events"("idempotency_key");

-- 4. Create indexes on travel_events (if not exists)
CREATE INDEX IF NOT EXISTS "travel_events_trip_id_occurred_at_idx"
  ON "travel_events"("trip_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "travel_events_trip_id_event_type_occurred_at_idx"
  ON "travel_events"("trip_id", "event_type", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "travel_events_segment_occurred_at_idx"
  ON "travel_events"("segment", "occurred_at" DESC);

-- 5. Add foreign key on travel_events (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints
    WHERE constraint_name = 'travel_events_trip_id_fkey'
  ) THEN
    ALTER TABLE "travel_events"
      ADD CONSTRAINT "travel_events_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. Create travel_outcomes table (if not exists)
CREATE TABLE IF NOT EXISTS "travel_outcomes" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "success" TEXT NOT NULL,
    "satisfaction" DOUBLE PRECISION NOT NULL,
    "budget_performance" TEXT NOT NULL,
    "planned_budget" DOUBLE PRECISION NOT NULL,
    "actual_spent" DOUBLE PRECISION NOT NULL,
    "budget_deviation" DOUBLE PRECISION NOT NULL,
    "completion_rate" TEXT NOT NULL,
    "planned_activities" INTEGER NOT NULL,
    "completed_activities" INTEGER NOT NULL,
    "completion_percentage" DOUBLE PRECISION NOT NULL,
    "companion_satisfaction" TEXT NOT NULL,
    "companion_match_score" DOUBLE PRECISION NOT NULL,
    "companion_count" INTEGER NOT NULL,
    "satisfied_companions" INTEGER NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "metrics" JSONB,
    "factors" JSONB,
    "recommendations" JSONB,
    "computed_at" TIMESTAMPTZ(6) NOT NULL,
    "data_quality" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "travel_outcomes_pkey" PRIMARY KEY ("id")
);

-- 7. Create indexes on travel_outcomes (if not exists)
CREATE INDEX IF NOT EXISTS "travel_outcomes_trip_id_idx"
  ON "travel_outcomes"("trip_id");

CREATE INDEX IF NOT EXISTS "travel_outcomes_success_idx"
  ON "travel_outcomes"("success");

CREATE INDEX IF NOT EXISTS "travel_outcomes_overall_score_idx"
  ON "travel_outcomes"("overall_score");

-- 8. Add foreign key on travel_outcomes (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints
    WHERE constraint_name = 'travel_outcomes_trip_id_fkey'
  ) THEN
    ALTER TABLE "travel_outcomes"
      ADD CONSTRAINT "travel_outcomes_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
