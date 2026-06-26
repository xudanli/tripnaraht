-- Identity endorsements + trusted project withdrawal support

CREATE TABLE IF NOT EXISTS "identity_endorsements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "endorser_subject_type" VARCHAR(32) NOT NULL,
    "endorser_subject_id" UUID NOT NULL,
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" UUID NOT NULL,
    "endorsement_type" VARCHAR(64) NOT NULL,
    "fact_statement" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB,
    "related_listing_id" UUID,
    "related_trip_id" TEXT,
    "issued_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "verified_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "identity_endorsements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "identity_endorsements_subject_type_subject_id_status_idx"
    ON "identity_endorsements"("subject_type", "subject_id", "status");
CREATE INDEX IF NOT EXISTS "identity_endorsements_endorser_subject_type_endorser_subject_id_status_idx"
    ON "identity_endorsements"("endorser_subject_type", "endorser_subject_id", "status");
CREATE INDEX IF NOT EXISTS "identity_endorsements_related_listing_id_idx"
    ON "identity_endorsements"("related_listing_id");
