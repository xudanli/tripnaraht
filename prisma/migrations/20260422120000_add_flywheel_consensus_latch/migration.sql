-- Flywheel: distributed consensus latch (hysteresis) per normalized contextKey
CREATE TABLE IF NOT EXISTS "flywheel_consensus_latches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "context_key" VARCHAR(80) NOT NULL,
    "state" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_consensus_latches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "flywheel_consensus_latches_context_key_key"
    ON "flywheel_consensus_latches"("context_key");

CREATE INDEX IF NOT EXISTS "flywheel_consensus_latches_updated_at_idx"
    ON "flywheel_consensus_latches"("updated_at" DESC);
