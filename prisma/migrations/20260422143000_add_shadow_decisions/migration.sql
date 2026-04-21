-- Shadow Mode: append-only audit rows for reproducible decision traces (Guardian Actuator / Sentinel).
-- Idempotent: safe to re-run if partially applied.

CREATE TABLE IF NOT EXISTS "shadow_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "trip_id" UUID,
    "region" VARCHAR(120),
    "context_key" VARCHAR(80),
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" JSONB NOT NULL,

    CONSTRAINT "shadow_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shadow_decisions_user_id_idx"
    ON "shadow_decisions"("user_id");

CREATE INDEX IF NOT EXISTS "shadow_decisions_trip_id_idx"
    ON "shadow_decisions"("trip_id");

CREATE INDEX IF NOT EXISTS "shadow_decisions_context_key_idx"
    ON "shadow_decisions"("context_key");

CREATE INDEX IF NOT EXISTS "shadow_decisions_captured_at_idx"
    ON "shadow_decisions"("captured_at" DESC);
