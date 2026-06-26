-- Qualifications + reputation events

CREATE TABLE IF NOT EXISTS "qualifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" UUID NOT NULL,
    "qualification_type" VARCHAR(64) NOT NULL,
    "issuer" VARCHAR(200),
    "certificate_number" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB,
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "qualifications_subject_type_subject_id_status_idx"
    ON "qualifications"("subject_type", "subject_id", "status");
CREATE INDEX IF NOT EXISTS "qualifications_qualification_type_status_idx"
    ON "qualifications"("qualification_type", "status");

CREATE TABLE IF NOT EXISTS "reputation_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" UUID NOT NULL,
    "project_id" TEXT,
    "listing_id" UUID,
    "event_type" VARCHAR(64) NOT NULL,
    "event_result" VARCHAR(64),
    "evidence_source" VARCHAR(64) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_by_id" UUID,
    "metadata" JSONB,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reputation_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reputation_events_idempotency_key_key"
    ON "reputation_events"("idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "reputation_events_subject_type_subject_id_occurred_at_idx"
    ON "reputation_events"("subject_type", "subject_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "reputation_events_event_type_occurred_at_idx"
    ON "reputation_events"("event_type", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "reputation_events_listing_id_idx"
    ON "reputation_events"("listing_id");
CREATE INDEX IF NOT EXISTS "reputation_events_project_id_idx"
    ON "reputation_events"("project_id");
