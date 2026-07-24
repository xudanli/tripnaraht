-- RFC-003: persist Travel Context revision diff journal (Phase 5 production hardening)

CREATE TABLE IF NOT EXISTS "travel_context_revision_journal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "context_id" VARCHAR(64) NOT NULL,
  "from_revision" BIGINT NOT NULL,
  "to_revision" BIGINT NOT NULL,
  "snapshot_id" VARCHAR(128),
  "changed_domains" JSONB NOT NULL,
  "changes" JSONB NOT NULL,
  "intent_type" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "travel_context_revision_journal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "travel_context_revision_journal_context_id_from_revision_to_revision_key"
  ON "travel_context_revision_journal"("context_id", "from_revision", "to_revision");

CREATE INDEX IF NOT EXISTS "travel_context_revision_journal_context_id_from_revision_idx"
  ON "travel_context_revision_journal"("context_id", "from_revision");

CREATE INDEX IF NOT EXISTS "travel_context_revision_journal_context_id_to_revision_idx"
  ON "travel_context_revision_journal"("context_id", "to_revision" DESC);
