-- Project Fit R2: rule templates, reputation disputes

CREATE TABLE IF NOT EXISTS "project_eligibility_rule_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_subject_type" VARCHAR(32) NOT NULL,
    "owner_subject_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "destination_tag" VARCHAR(64),
    "commercial_type" VARCHAR(32),
    "rules" JSONB NOT NULL,
    "fit_config" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_eligibility_rule_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_eligibility_rule_templates_owner_idx"
  ON "project_eligibility_rule_templates"("owner_subject_type", "owner_subject_id", "status");

CREATE INDEX IF NOT EXISTS "project_eligibility_rule_templates_destination_idx"
  ON "project_eligibility_rule_templates"("destination_tag", "commercial_type");

CREATE INDEX IF NOT EXISTS "project_eligibility_rules_template_id_idx"
  ON "project_eligibility_rules"("template_id");

CREATE TABLE IF NOT EXISTS "reputation_event_disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "submitter_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    "resolution" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reputation_event_disputes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reputation_event_disputes_event_id_idx"
  ON "reputation_event_disputes"("event_id");

CREATE INDEX IF NOT EXISTS "reputation_event_disputes_submitter_status_idx"
  ON "reputation_event_disputes"("submitter_id", "status");

CREATE INDEX IF NOT EXISTS "reputation_event_disputes_status_created_idx"
  ON "reputation_event_disputes"("status", "created_at");

ALTER TABLE "reputation_event_disputes"
  ADD CONSTRAINT "reputation_event_disputes_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "reputation_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trusted_project_applications"
  ADD COLUMN IF NOT EXISTS "commitment_status" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "deposit_amount_cents" INTEGER;

-- Platform default templates for controlled market (R2)
INSERT INTO "project_eligibility_rule_templates" (
  "id", "owner_subject_type", "owner_subject_id", "name", "description",
  "destination_tag", "commercial_type", "rules", "fit_config", "status", "version"
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'PLATFORM',
  '00000000-0000-4000-8000-000000000001',
  '标准徒步准入包',
  '适用于中等强度徒步项目的默认硬性准入规则',
  'TREK',
  'NON_COMMERCIAL',
  '[
    {"ruleType":"RESOURCE","conditionKey":"dates_available","operator":"EQ","value":{"expected":true},"severity":"BLOCKER","evidenceRequirement":"SELF_DECLARE","waiverPolicy":"NOT_ALLOWED","explanationTemplate":"需能完整参与项目日期"},
    {"ruleType":"RESOURCE","conditionKey":"budget_affordable","operator":"GTE","value":{"minCents":0},"severity":"BLOCKER","evidenceRequirement":"SELF_DECLARE","waiverPolicy":"NOT_ALLOWED","explanationTemplate":"需能承担项目最低费用"},
    {"ruleType":"POLICY","conditionKey":"equipment_ready","operator":"EQ","value":{"expected":true},"severity":"MUST_CONFIRM","evidenceRequirement":"SELF_DECLARE","waiverPolicy":"LEADER_APPROVAL","explanationTemplate":"需具备必要装备"}
  ]'::jsonb,
  '{"enabledSoftDimensions":["pace","risk","accommodation","budget_flexibility"],"previewQuestionKeys":["dates_available","budget_cents","pace_acceptance"]}'::jsonb,
  'ACTIVE',
  1
) ON CONFLICT ("id") DO NOTHING;
