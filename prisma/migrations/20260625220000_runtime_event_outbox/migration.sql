-- Decision Runtime Transactional Outbox (Tier 1.2)
CREATE TABLE IF NOT EXISTS "runtime_event_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "gate1_project_id" UUID,
    "event_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "travel_event_id" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "runtime_event_outbox_idempotency_key_key"
    ON "runtime_event_outbox"("idempotency_key");

CREATE INDEX IF NOT EXISTS "runtime_event_outbox_status_created_at_idx"
    ON "runtime_event_outbox"("status", "created_at");

CREATE INDEX IF NOT EXISTS "runtime_event_outbox_trip_id_created_at_idx"
    ON "runtime_event_outbox"("trip_id", "created_at");
