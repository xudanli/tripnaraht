-- Execution Risk Center — per-user interaction state (manual / idempotent apply)
-- Same as migration 20260709120000_add_execution_risk_user_state

CREATE TABLE IF NOT EXISTS "trip_execution_risk_user_states" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "risk_key" VARCHAR(256) NOT NULL,
    "user_id" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6),
    "acknowledged_by" TEXT,
    "snoozed_until" TIMESTAMPTZ(6),
    "dismissed_at" TIMESTAMPTZ(6),
    "last_viewed_at" TIMESTAMPTZ(6),
    "notification_state" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_execution_risk_user_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_execution_risk_user_states_trip_id_risk_key_user_id_key"
    ON "trip_execution_risk_user_states"("trip_id", "risk_key", "user_id");

CREATE INDEX IF NOT EXISTS "trip_execution_risk_user_states_trip_id_user_id_idx"
    ON "trip_execution_risk_user_states"("trip_id", "user_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'trip_execution_risk_user_states_trip_id_fkey'
    ) THEN
        ALTER TABLE "trip_execution_risk_user_states"
            ADD CONSTRAINT "trip_execution_risk_user_states_trip_id_fkey"
            FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
