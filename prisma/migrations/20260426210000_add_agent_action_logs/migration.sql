-- Commit saga ledger (action vs side-effect apply)

CREATE TABLE IF NOT EXISTS "agent_action_logs" (
    "id" UUID NOT NULL,
    "request_id" VARCHAR(255) NOT NULL,
    "trip_id" VARCHAR(255) NOT NULL,
    "action_id" VARCHAR(255) NOT NULL,
    "action_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "idempotency_key" VARCHAR(255),
    "payload" JSONB,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_action_logs_trip_id_action_id_created_at_idx"
    ON "agent_action_logs"("trip_id", "action_id", "created_at");

CREATE INDEX IF NOT EXISTS "agent_action_logs_status_updated_at_idx"
    ON "agent_action_logs"("status", "updated_at");
