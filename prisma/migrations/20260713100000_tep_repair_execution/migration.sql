-- WP-TEP-17: Distributed TEP local repair idempotency / concurrency gate

CREATE TABLE IF NOT EXISTS "tep_repair_executions" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "plan_version_id" TEXT,
    "decision_id" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6),

    CONSTRAINT "tep_repair_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tep_repair_executions_idempotency_key_key"
    ON "tep_repair_executions"("idempotency_key");

CREATE INDEX IF NOT EXISTS "tep_repair_executions_trip_id_idx"
    ON "tep_repair_executions"("trip_id");

CREATE INDEX IF NOT EXISTS "tep_repair_executions_trip_id_option_id_status_idx"
    ON "tep_repair_executions"("trip_id", "option_id", "status");
