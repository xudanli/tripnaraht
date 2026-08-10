-- Travel Memory Runtime Phase 1: Evidence Chain (Decision Accountability)
-- Append-only ledger; not a cache.

CREATE TABLE IF NOT EXISTS "travel_memory_events" (
    "id" VARCHAR(64) NOT NULL,
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" VARCHAR(128) NOT NULL,
    "memory_type" VARCHAR(64) NOT NULL,
    "predicate" VARCHAR(256) NOT NULL,
    "scope" VARCHAR(32) NOT NULL,
    "value" JSONB NOT NULL,
    "lifecycle_status" VARCHAR(32) NOT NULL,
    "event_status" VARCHAR(32) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "op" VARCHAR(32) NOT NULL,
    "source_type" VARCHAR(64) NOT NULL,
    "decision_id" VARCHAR(128),
    "episode_id" VARCHAR(128),
    "trip_id" VARCHAR(128),
    "supersedes_event_id" VARCHAR(64),
    "superseded_by" VARCHAR(64),
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "superseded_at" TIMESTAMPTZ(6),
    "evidence_refs_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_memory_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "travel_memory_events_subject_type_subject_id_predicate_recorded_at_idx"
  ON "travel_memory_events"("subject_type", "subject_id", "predicate", "recorded_at");
CREATE INDEX IF NOT EXISTS "travel_memory_events_decision_id_idx"
  ON "travel_memory_events"("decision_id");
CREATE INDEX IF NOT EXISTS "travel_memory_events_episode_id_idx"
  ON "travel_memory_events"("episode_id");
CREATE INDEX IF NOT EXISTS "travel_memory_events_trip_id_recorded_at_idx"
  ON "travel_memory_events"("trip_id", "recorded_at");
CREATE INDEX IF NOT EXISTS "travel_memory_events_lifecycle_status_event_status_idx"
  ON "travel_memory_events"("lifecycle_status", "event_status");

CREATE TABLE IF NOT EXISTS "travel_memory_evidence" (
    "id" UUID NOT NULL,
    "memory_event_id" VARCHAR(64) NOT NULL,
    "evidence_type" VARCHAR(64) NOT NULL,
    "evidence_id" VARCHAR(128) NOT NULL,
    "weight" DOUBLE PRECISION,
    "note" VARCHAR(512),
    "at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_memory_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "travel_memory_evidence_memory_event_id_idx"
  ON "travel_memory_evidence"("memory_event_id");
CREATE INDEX IF NOT EXISTS "travel_memory_evidence_evidence_type_evidence_id_idx"
  ON "travel_memory_evidence"("evidence_type", "evidence_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'travel_memory_evidence_memory_event_id_fkey'
  ) THEN
    ALTER TABLE "travel_memory_evidence"
      ADD CONSTRAINT "travel_memory_evidence_memory_event_id_fkey"
      FOREIGN KEY ("memory_event_id") REFERENCES "travel_memory_events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
