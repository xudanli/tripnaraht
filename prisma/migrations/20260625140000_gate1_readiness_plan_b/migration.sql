-- Gate 1 V0.2: Readiness reports + Plan B

CREATE TABLE IF NOT EXISTS "gate1_readiness_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "source_type" VARCHAR(32) NOT NULL DEFAULT 'HUMAN_ASSISTED',
    "human_minutes" INTEGER,
    "created_by" VARCHAR(255) NOT NULL,
    "reviewed_by" VARCHAR(255),
    "published_by" VARCHAR(255),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_readiness_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_readiness_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_readiness_reports_project_id_version_key" ON "gate1_readiness_reports"("project_id", "version");
CREATE INDEX IF NOT EXISTS "gate1_readiness_reports_project_id_status_idx" ON "gate1_readiness_reports"("project_id", "status");

CREATE TABLE IF NOT EXISTS "gate1_readiness_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "dimension" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "responsible_party" VARCHAR(128),
    "due_at" TIMESTAMPTZ(6),
    "is_incremental" BOOLEAN NOT NULL DEFAULT true,
    "advisor_feedback" VARCHAR(32),
    "advisor_feedback_note" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_readiness_findings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_readiness_findings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "gate1_readiness_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_readiness_findings_report_id_idx" ON "gate1_readiness_findings"("report_id");

CREATE TABLE IF NOT EXISTS "gate1_plan_b" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "source_type" VARCHAR(32) NOT NULL DEFAULT 'HUMAN_ASSISTED',
    "human_minutes" INTEGER,
    "risk_title" VARCHAR(255) NOT NULL,
    "risk_description" TEXT,
    "trigger_condition" TEXT NOT NULL,
    "latest_decision_at" TIMESTAMPTZ(6),
    "alternative_summary" TEXT NOT NULL,
    "cost_summary" TEXT,
    "impact_summary" TEXT,
    "advisor_pre_decision" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "advisor_pre_decision_reason" TEXT,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggered_at" TIMESTAMPTZ(6),
    "adopted" BOOLEAN,
    "adopted_at" TIMESTAMPTZ(6),
    "outcome_summary" TEXT,
    "created_by" VARCHAR(255) NOT NULL,
    "reviewed_by" VARCHAR(255),
    "published_by" VARCHAR(255),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_plan_b_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_plan_b_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_plan_b_project_id_version_label_key" ON "gate1_plan_b"("project_id", "version", "label");
CREATE INDEX IF NOT EXISTS "gate1_plan_b_project_id_status_idx" ON "gate1_plan_b"("project_id", "status");
