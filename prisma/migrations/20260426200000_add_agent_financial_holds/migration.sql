-- FINANCIAL_HOLD persistence (survives process restarts)

CREATE TABLE IF NOT EXISTS "agent_financial_holds" (
    "hold_id" VARCHAR(255) NOT NULL,
    "action_id" VARCHAR(255) NOT NULL,
    "action_name" VARCHAR(255) NOT NULL,
    "trip_id" VARCHAR(255) NOT NULL,
    "request_id" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_financial_holds_pkey" PRIMARY KEY ("hold_id")
);

CREATE INDEX IF NOT EXISTS "agent_financial_holds_trip_id_expires_at_idx"
    ON "agent_financial_holds"("trip_id", "expires_at");
