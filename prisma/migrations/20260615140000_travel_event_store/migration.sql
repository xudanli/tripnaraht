-- Append-only Travel Event Store (Phase 2 foundation).
-- Application code must not UPDATE rows.

CREATE TABLE "travel_events" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT,
    "request_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'trip.lifecycle',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "idempotency_key" TEXT NOT NULL,

    CONSTRAINT "travel_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "travel_events_idempotency_key_key"
    ON "travel_events" ("idempotency_key");

CREATE INDEX "travel_events_trip_id_occurred_at_idx"
    ON "travel_events" ("trip_id", "occurred_at" DESC);

CREATE INDEX "travel_events_trip_id_event_type_occurred_at_idx"
    ON "travel_events" ("trip_id", "event_type", "occurred_at" DESC);

CREATE INDEX "travel_events_segment_occurred_at_idx"
    ON "travel_events" ("segment", "occurred_at" DESC);

ALTER TABLE "travel_events"
    ADD CONSTRAINT "travel_events_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
