-- Add decisionStage column to decision_logs table
-- This field tracks which stage of the decision pipeline the log entry was created at

-- Step 0: Create table if it doesn't exist (for shadow database compatibility)
CREATE TABLE IF NOT EXISTS "decision_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID,
    "country_code" VARCHAR(2),
    "route_direction_id" VARCHAR(255),
    "persona" VARCHAR(20) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "decision_source" VARCHAR(20) NOT NULL,
    "explanation" TEXT NOT NULL,
    "reason_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "evidence_refs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    
    CONSTRAINT "decision_logs_pkey" PRIMARY KEY ("id")
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "decision_logs_trip_id_idx" ON "decision_logs"("trip_id");
CREATE INDEX IF NOT EXISTS "decision_logs_country_code_idx" ON "decision_logs"("country_code");
CREATE INDEX IF NOT EXISTS "decision_logs_route_direction_id_idx" ON "decision_logs"("route_direction_id");
CREATE INDEX IF NOT EXISTS "decision_logs_decision_source_idx" ON "decision_logs"("decision_source");
CREATE INDEX IF NOT EXISTS "decision_logs_persona_idx" ON "decision_logs"("persona");
CREATE INDEX IF NOT EXISTS "decision_logs_timestamp_idx" ON "decision_logs"("timestamp");
CREATE INDEX IF NOT EXISTS "decision_logs_country_code_route_direction_id_decision_source_idx" ON "decision_logs"("country_code", "route_direction_id", "decision_source");

-- Step 1: Add column (nullable first, to handle existing data)
ALTER TABLE "decision_logs" 
ADD COLUMN IF NOT EXISTS "decision_stage" VARCHAR(20);

-- Step 2: Update existing records with default value (FINALIZE for backward compatibility)
UPDATE "decision_logs" 
SET "decision_stage" = 'FINALIZE' 
WHERE "decision_stage" IS NULL;

-- Step 3: Add check constraint to ensure valid decisionStage values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'decision_logs' 
    AND constraint_name = 'decision_logs_decision_stage_check'
  ) THEN
    ALTER TABLE "decision_logs" 
    ADD CONSTRAINT "decision_logs_decision_stage_check" 
    CHECK ("decision_stage" IN ('ROUTE_PICK', 'DEM_EVIDENCE', 'ABU_GATE', 'PACE_ADJUST', 'SPATIAL_REPAIR', 'READINESS', 'FINALIZE'));
  END IF;
END $$;

-- Step 4: Set NOT NULL constraint (after all data is updated)
ALTER TABLE "decision_logs" 
ALTER COLUMN "decision_stage" SET NOT NULL;

-- Step 5: Add indexes for efficient filtering
CREATE INDEX IF NOT EXISTS "decision_logs_decision_stage_idx" ON "decision_logs"("decision_stage");

-- Step 6: Add composite index for decisionStage + decisionSource (for analytics)
CREATE INDEX IF NOT EXISTS "decision_logs_decision_stage_decision_source_idx" ON "decision_logs"("decision_stage", "decision_source");
