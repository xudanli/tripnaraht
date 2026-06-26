-- Project Fit R0: eligibility rules, assessments, appeals; extend applications

ALTER TABLE "trusted_project_applications"
  ADD COLUMN IF NOT EXISTS "fit_assessment_id" UUID,
  ADD COLUMN IF NOT EXISTS "leader_decision" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "structured_reject_reason" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "leader_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "user_confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "trusted_project_applications_fit_assessment_id_idx"
  ON "trusted_project_applications"("fit_assessment_id");

ALTER TABLE "trusted_project_applications"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

CREATE TABLE IF NOT EXISTS "project_eligibility_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "template_id" UUID,
    "rule_type" VARCHAR(32) NOT NULL,
    "condition_key" VARCHAR(64) NOT NULL,
    "operator" VARCHAR(32) NOT NULL,
    "value" JSONB NOT NULL,
    "severity" VARCHAR(32) NOT NULL,
    "evidence_requirement" VARCHAR(32) NOT NULL,
    "waiver_policy" VARCHAR(32) NOT NULL,
    "explanation_template" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_eligibility_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_eligibility_rules_listing_id_is_active_version_idx"
    ON "project_eligibility_rules"("listing_id", "is_active", "version");
CREATE INDEX IF NOT EXISTS "project_eligibility_rules_condition_key_rule_type_idx"
    ON "project_eligibility_rules"("condition_key", "rule_type");

CREATE TABLE IF NOT EXISTS "project_fit_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rule_snapshot_version" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
    "overall_result" VARCHAR(32),
    "hard_results" JSONB,
    "dimension_results" JSONB,
    "team_impact_result" JSONB,
    "required_confirmations" JSONB,
    "explanation_bundle" JSONB,
    "expires_at" TIMESTAMPTZ(6),
    "evaluated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_fit_assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_fit_assessments_listing_id_user_id_status_idx"
    ON "project_fit_assessments"("listing_id", "user_id", "status");
CREATE INDEX IF NOT EXISTS "project_fit_assessments_user_id_updated_at_idx"
    ON "project_fit_assessments"("user_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "fit_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "question_key" VARCHAR(64) NOT NULL,
    "answer" JSONB NOT NULL,
    "sensitivity_level" VARCHAR(16) NOT NULL DEFAULT 'LOW',
    "consent_scope" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fit_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fit_answers_assessment_id_question_key_key"
    ON "fit_answers"("assessment_id", "question_key");
CREATE INDEX IF NOT EXISTS "fit_answers_assessment_id_idx"
    ON "fit_answers"("assessment_id");

CREATE TABLE IF NOT EXISTS "project_fit_appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submitter_id" UUID NOT NULL,
    "target_type" VARCHAR(64) NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    "resolution" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_fit_appeals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_fit_appeals_submitter_id_status_idx"
    ON "project_fit_appeals"("submitter_id", "status");
CREATE INDEX IF NOT EXISTS "project_fit_appeals_target_type_target_id_idx"
    ON "project_fit_appeals"("target_type", "target_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_eligibility_rules_listing_id_fkey'
  ) THEN
    ALTER TABLE "project_eligibility_rules"
      ADD CONSTRAINT "project_eligibility_rules_listing_id_fkey"
      FOREIGN KEY ("listing_id") REFERENCES "trusted_project_listings"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_fit_assessments_listing_id_fkey'
  ) THEN
    ALTER TABLE "project_fit_assessments"
      ADD CONSTRAINT "project_fit_assessments_listing_id_fkey"
      FOREIGN KEY ("listing_id") REFERENCES "trusted_project_listings"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fit_answers_assessment_id_fkey'
  ) THEN
    ALTER TABLE "fit_answers"
      ADD CONSTRAINT "fit_answers_assessment_id_fkey"
      FOREIGN KEY ("assessment_id") REFERENCES "project_fit_assessments"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trusted_project_applications_fit_assessment_id_fkey'
  ) THEN
    ALTER TABLE "trusted_project_applications"
      ADD CONSTRAINT "trusted_project_applications_fit_assessment_id_fkey"
      FOREIGN KEY ("fit_assessment_id") REFERENCES "project_fit_assessments"("id") ON DELETE SET NULL;
  END IF;
END $$;
