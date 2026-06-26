-- Loop Engineering Phase 1: loop_runs + loop_iterations
-- Application owns status transitions; rows are append-only for iterations.

CREATE TABLE IF NOT EXISTS "loop_runs" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "loop_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger_event_id" TEXT,
    "current_iteration" INTEGER NOT NULL DEFAULT 0,
    "token_budget" INTEGER,
    "cost_budget_usd" DOUBLE PRECISION,
    "time_budget_ms" INTEGER,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "final_outcome" JSONB,
    "metadata" JSONB,

    CONSTRAINT "loop_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "loop_iterations" (
    "id" TEXT NOT NULL,
    "loop_run_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "observed_state" JSONB NOT NULL,
    "diagnosis" JSONB NOT NULL,
    "proposed_action" JSONB NOT NULL,
    "validation_result" JSONB NOT NULL,
    "decision" TEXT NOT NULL,
    "model_usage" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loop_iterations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "loop_iterations_loop_run_id_sequence_key"
    ON "loop_iterations" ("loop_run_id", "sequence");

CREATE INDEX IF NOT EXISTS "loop_runs_trip_id_started_at_idx"
    ON "loop_runs" ("trip_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "loop_runs_trip_id_loop_type_status_idx"
    ON "loop_runs" ("trip_id", "loop_type", "status");

CREATE INDEX IF NOT EXISTS "loop_iterations_loop_run_id_sequence_idx"
    ON "loop_iterations" ("loop_run_id", "sequence");

DO $$ BEGIN
    ALTER TABLE "loop_runs"
        ADD CONSTRAINT "loop_runs_trip_id_fkey"
        FOREIGN KEY ("trip_id") REFERENCES "Trip"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "loop_iterations"
        ADD CONSTRAINT "loop_iterations_loop_run_id_fkey"
        FOREIGN KEY ("loop_run_id") REFERENCES "loop_runs"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
