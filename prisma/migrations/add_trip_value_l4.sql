-- L4 Value feedback + Money DNA
-- Safe to run multiple times (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "trip_value_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "source_type" VARCHAR(32) NOT NULL,
    "source_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'CNY',
    "satisfaction" INTEGER NOT NULL,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_value_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_value_feedback_satisfaction_check" CHECK ("satisfaction" >= 1 AND "satisfaction" <= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_value_feedback_unique_source_user"
  ON "trip_value_feedback"("trip_id", "source_type", "source_id", "created_by");

CREATE INDEX IF NOT EXISTS "trip_value_feedback_trip_id_idx"
  ON "trip_value_feedback"("trip_id");

CREATE INDEX IF NOT EXISTS "trip_value_feedback_created_by_idx"
  ON "trip_value_feedback"("created_by");

CREATE TABLE IF NOT EXISTS "user_money_dna" (
    "user_id" UUID NOT NULL,
    "experience_sensitivity" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "accommodation_sensitivity" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "efficiency_sensitivity" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "frugality_index" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "dominant_persona" VARCHAR(32) NOT NULL DEFAULT 'balanced',
    "trip_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_money_dna_pkey" PRIMARY KEY ("user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_value_feedback_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_value_feedback"
      ADD CONSTRAINT "trip_value_feedback_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
