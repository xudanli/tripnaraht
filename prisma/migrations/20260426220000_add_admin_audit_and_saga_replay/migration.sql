-- Admin audit trail + saga replay idempotency ledger

CREATE TABLE IF NOT EXISTS "admin_activity_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" VARCHAR(255),
    "path" VARCHAR(512) NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_activity_logs_created_at_idx"
    ON "admin_activity_logs"("created_at");

CREATE TABLE IF NOT EXISTS "admin_saga_side_effect_replays" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agent_action_log_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255),

    CONSTRAINT "admin_saga_side_effect_replays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_saga_side_effect_replays_agent_action_log_id_key"
    ON "admin_saga_side_effect_replays"("agent_action_log_id");

CREATE INDEX IF NOT EXISTS "admin_saga_side_effect_replays_idempotency_key_idx"
    ON "admin_saga_side_effect_replays"("idempotency_key");
