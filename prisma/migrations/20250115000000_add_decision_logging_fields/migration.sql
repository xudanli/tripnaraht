-- Add decision logging fields to decision_logs table
-- This migration adds fields for decision point tracking, user choices, and system recommendations

-- Add new columns to decision_logs table
ALTER TABLE "decision_logs" 
ADD COLUMN IF NOT EXISTS "available_options" JSONB,
ADD COLUMN IF NOT EXISTS "user_choice" JSONB,
ADD COLUMN IF NOT EXISTS "user_reasoning" TEXT,
ADD COLUMN IF NOT EXISTS "confidence_level" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "system_recommendation" JSONB,
ADD COLUMN IF NOT EXISTS "alignment_score" DOUBLE PRECISION;

-- Create decision_outcomes table if it doesn't exist
CREATE TABLE IF NOT EXISTS "decision_outcomes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "decision_id" UUID NOT NULL,
    "expected_outcome" JSONB NOT NULL,
    "actual_outcome" JSONB NOT NULL,
    "deviation" JSONB NOT NULL,
    "user_satisfaction" DOUBLE PRECISION,
    "user_feedback" TEXT,
    "learning_signals" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_outcomes_pkey" PRIMARY KEY ("id")
);

-- Create foreign key relationship
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'decision_outcomes' 
    AND constraint_name = 'decision_outcomes_decision_id_fkey'
  ) THEN
    ALTER TABLE "decision_outcomes" 
    ADD CONSTRAINT "decision_outcomes_decision_id_fkey" 
    FOREIGN KEY ("decision_id") 
    REFERENCES "decision_logs"("id") 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Create index on decision_id for efficient lookups
CREATE INDEX IF NOT EXISTS "decision_outcomes_decision_id_idx" ON "decision_outcomes"("decision_id");
