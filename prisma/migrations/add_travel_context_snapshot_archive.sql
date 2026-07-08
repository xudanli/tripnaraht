-- RFC-003 Phase 7: Travel Context snapshot archive (audit replay + cold-start cache)

CREATE TABLE IF NOT EXISTS "travel_context_snapshot_archive" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "context_id" VARCHAR(64) NOT NULL,
  "revision" BIGINT NOT NULL,
  "snapshot_id" VARCHAR(128) NOT NULL,
  "schema_id" VARCHAR(64) NOT NULL,
  "stage" VARCHAR(32) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "bindings_fingerprint" VARCHAR(256) NOT NULL,
  "archive_source" VARCHAR(32) NOT NULL,
  "intent_type" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "travel_context_snapshot_archive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "travel_context_snapshot_archive_context_id_revision_key"
  ON "travel_context_snapshot_archive"("context_id", "revision");

CREATE INDEX IF NOT EXISTS "travel_context_snapshot_archive_context_id_created_at_idx"
  ON "travel_context_snapshot_archive"("context_id", "created_at" DESC);
