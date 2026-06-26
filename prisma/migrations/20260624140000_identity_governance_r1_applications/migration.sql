-- R1: agency certification + publishing permission applications

CREATE TABLE IF NOT EXISTS "publishing_permission_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" UUID NOT NULL,
    "applicant_user_id" UUID NOT NULL,
    "requested_level" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "review_notes" TEXT,
    "reviewed_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "publishing_permission_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "publishing_permission_applications_status_submitted_at_idx"
    ON "publishing_permission_applications"("status", "submitted_at" ASC);
CREATE INDEX IF NOT EXISTS "publishing_permission_applications_subject_type_subject_id_idx"
    ON "publishing_permission_applications"("subject_type", "subject_id");
CREATE INDEX IF NOT EXISTS "publishing_permission_applications_applicant_user_id_idx"
    ON "publishing_permission_applications"("applicant_user_id");

CREATE TABLE IF NOT EXISTS "agency_certifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "materials" JSONB,
    "review_notes" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agency_certifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agency_certifications_organization_id_status_idx"
    ON "agency_certifications"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "agency_certifications_status_updated_at_idx"
    ON "agency_certifications"("status", "updated_at" DESC);

ALTER TABLE "agency_certifications"
    ADD CONSTRAINT "agency_certifications_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
