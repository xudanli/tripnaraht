-- Trusted project listings + applications

CREATE TABLE IF NOT EXISTS "trusted_project_listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publisher_subject_type" VARCHAR(32) NOT NULL,
    "publisher_subject_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "responsible_user_id" UUID NOT NULL,
    "organization_id" UUID,
    "commercial_type" VARCHAR(32) NOT NULL,
    "review_status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "listing_status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "title" VARCHAR(300) NOT NULL,
    "destination" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "slots_total" INTEGER NOT NULL DEFAULT 1,
    "slots_filled" INTEGER NOT NULL DEFAULT 0,
    "budget_min_cents" INTEGER,
    "budget_max_cents" INTEGER,
    "risk_disclosure" TEXT,
    "refund_policy" TEXT,
    "review_notes" TEXT,
    "reviewed_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "trip_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trusted_project_listings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trusted_project_listings_listing_status_start_date_idx"
    ON "trusted_project_listings"("listing_status", "start_date");
CREATE INDEX IF NOT EXISTS "trusted_project_listings_publisher_subject_type_subject_id_idx"
    ON "trusted_project_listings"("publisher_subject_type", "publisher_subject_id");
CREATE INDEX IF NOT EXISTS "trusted_project_listings_review_status_submitted_at_idx"
    ON "trusted_project_listings"("review_status", "submitted_at" ASC);

CREATE TABLE IF NOT EXISTS "trusted_project_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "applicant_user_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trusted_project_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trusted_project_applications_listing_id_applicant_user_id_key"
    ON "trusted_project_applications"("listing_id", "applicant_user_id");
CREATE INDEX IF NOT EXISTS "trusted_project_applications_listing_id_status_idx"
    ON "trusted_project_applications"("listing_id", "status");
CREATE INDEX IF NOT EXISTS "trusted_project_applications_applicant_user_id_idx"
    ON "trusted_project_applications"("applicant_user_id");

ALTER TABLE "trusted_project_applications"
    ADD CONSTRAINT "trusted_project_applications_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "trusted_project_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
