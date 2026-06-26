-- Budget gate decision log persistence (planning workbench)
-- Safe to run multiple times (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "trip_budget_decision_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "plan_id" VARCHAR(256) NOT NULL,
    "verdict" VARCHAR(32) NOT NULL,
    "estimated_cost" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "budget_constraint" JSONB NOT NULL,
    "budget_violations" JSONB,
    "evidence_refs" JSONB NOT NULL DEFAULT '[]',
    "persona" VARCHAR(16),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_budget_decision_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trip_budget_decision_logs_trip_plan_created_idx"
  ON "trip_budget_decision_logs"("trip_id", "plan_id", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_budget_decision_logs_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_budget_decision_logs"
      ADD CONSTRAINT "trip_budget_decision_logs_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
