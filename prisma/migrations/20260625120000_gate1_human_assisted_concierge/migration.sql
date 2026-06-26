-- Gate 1 Human-Assisted Concierge validation experiment

CREATE TABLE IF NOT EXISTS "gate1_projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "advisor_user_id" VARCHAR(255) NOT NULL,
    "project_manager_id" VARCHAR(255),
    "linked_trip_id" TEXT,
    "title" VARCHAR(255) NOT NULL,
    "destination" VARCHAR(128),
    "cohort" VARCHAR(32) NOT NULL,
    "experiment_status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "participant_count" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "gate1_projects_organization_id_idx" ON "gate1_projects"("organization_id");
CREATE INDEX IF NOT EXISTS "gate1_projects_advisor_user_id_idx" ON "gate1_projects"("advisor_user_id");
CREATE INDEX IF NOT EXISTS "gate1_projects_cohort_experiment_status_idx" ON "gate1_projects"("cohort", "experiment_status");

CREATE TABLE IF NOT EXISTS "gate1_experiment_baselines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_by" VARCHAR(255) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "participant_count" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "destination" VARCHAR(128),
    "customer_type" VARCHAR(64),
    "budget_range" VARCHAR(128),
    "current_stage" VARCHAR(64),
    "expected_first_draft_hours" DOUBLE PRECISION,
    "expected_total_hours" DOUBLE PRECISION,
    "expected_revision_rounds" INTEGER,
    "difficulty_level" INTEGER,
    "known_constraints" JSONB,
    "known_conflicts" JSONB,
    "known_risks" JSONB,
    "pending_confirmations" JSONB,
    "might_reject_without_tripnara" VARCHAR(16),
    "reject_reason" TEXT,
    "estimated_gmv_cents" INTEGER,
    "original_plan_summary" TEXT,
    "attachments" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_experiment_baselines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_experiment_baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_experiment_baselines_project_id_version_key" ON "gate1_experiment_baselines"("project_id", "version");
CREATE INDEX IF NOT EXISTS "gate1_experiment_baselines_project_id_is_confirmed_idx" ON "gate1_experiment_baselines"("project_id", "is_confirmed");

CREATE TABLE IF NOT EXISTS "gate1_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "contact_hint" VARCHAR(255),
    "invite_token" VARCHAR(64) NOT NULL,
    "invite_expires_at" TIMESTAMPTZ(6),
    "invite_revoked_at" TIMESTAMPTZ(6),
    "status" VARCHAR(32) NOT NULL DEFAULT 'INVITED',
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMPTZ(6),
    "consented_at" TIMESTAMPTZ(6),
    "form_started_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "declined_at" TIMESTAMPTZ(6),
    "withdrawn_at" TIMESTAMPTZ(6),
    "decline_reason" TEXT,
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_participants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_participants_invite_token_key" ON "gate1_participants"("invite_token");
CREATE INDEX IF NOT EXISTS "gate1_participants_project_id_status_idx" ON "gate1_participants"("project_id", "status");

CREATE TABLE IF NOT EXISTS "gate1_consent_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_id" UUID NOT NULL,
    "consent_version" VARCHAR(32) NOT NULL,
    "consent_text" TEXT NOT NULL,
    "scope" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "granted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_consent_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_consent_records_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "gate1_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_consent_records_participant_id_status_idx" ON "gate1_consent_records"("participant_id", "status");

CREATE TABLE IF NOT EXISTS "gate1_preference_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "public_prefs" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_preference_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_preference_responses_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "gate1_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_preference_responses_participant_id_version_key" ON "gate1_preference_responses"("participant_id", "version");

CREATE TABLE IF NOT EXISTS "gate1_private_constraints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_id" UUID NOT NULL,
    "field_key" VARCHAR(64) NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "authorization_level" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_private_constraints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_private_constraints_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "gate1_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_private_constraints_participant_id_status_idx" ON "gate1_private_constraints"("participant_id", "status");

CREATE TABLE IF NOT EXISTS "gate1_privacy_analyst_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "analyst_id" VARCHAR(255) NOT NULL,
    "granted_by" VARCHAR(255) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_privacy_analyst_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_privacy_analyst_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_privacy_analyst_assignments_project_id_analyst_id_idx" ON "gate1_privacy_analyst_assignments"("project_id", "analyst_id");

CREATE TABLE IF NOT EXISTS "gate1_sanitized_constraints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "participant_id" UUID,
    "explanation" TEXT NOT NULL,
    "impact_summary" TEXT,
    "review_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "reviewed_by" VARCHAR(255),
    "reviewed_at" TIMESTAMPTZ(6),
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_sanitized_constraints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_sanitized_constraints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_sanitized_constraints_project_id_review_status_idx" ON "gate1_sanitized_constraints"("project_id", "review_status");

CREATE TABLE IF NOT EXISTS "gate1_conflict_reports" (
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
    CONSTRAINT "gate1_conflict_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_conflict_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_conflict_reports_project_id_version_key" ON "gate1_conflict_reports"("project_id", "version");
CREATE INDEX IF NOT EXISTS "gate1_conflict_reports_project_id_status_idx" ON "gate1_conflict_reports"("project_id", "status");

CREATE TABLE IF NOT EXISTS "gate1_conflict_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "conflict_type" VARCHAR(32) NOT NULL,
    "severity" VARCHAR(16) NOT NULL,
    "confidence" VARCHAR(16) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "baseline_status" VARCHAR(32) NOT NULL,
    "privacy_level" VARCHAR(16) NOT NULL DEFAULT 'SANITIZED',
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "resolution_direction" VARCHAR(64),
    "is_blocker" BOOLEAN NOT NULL DEFAULT false,
    "advisor_feedback" VARCHAR(32),
    "advisor_feedback_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_conflict_findings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_conflict_findings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "gate1_conflict_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_conflict_findings_report_id_idx" ON "gate1_conflict_findings"("report_id");

CREATE TABLE IF NOT EXISTS "gate1_candidate_strategies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "source_type" VARCHAR(32) NOT NULL DEFAULT 'HUMAN_ASSISTED',
    "human_minutes" INTEGER,
    "strategy_summary" TEXT NOT NULL,
    "constraint_satisfaction" JSONB,
    "tradeoffs" JSONB,
    "risks" JSONB,
    "budget_summary" TEXT,
    "created_by" VARCHAR(255) NOT NULL,
    "reviewed_by" VARCHAR(255),
    "published_by" VARCHAR(255),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_candidate_strategies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_candidate_strategies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_candidate_strategies_project_id_version_label_key" ON "gate1_candidate_strategies"("project_id", "version", "label");
CREATE INDEX IF NOT EXISTS "gate1_candidate_strategies_project_id_status_idx" ON "gate1_candidate_strategies"("project_id", "status");

CREATE TABLE IF NOT EXISTS "gate1_advisor_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "selected_candidate_id" UUID,
    "conflict_report_version" INTEGER,
    "adopted_none" BOOLEAN NOT NULL DEFAULT false,
    "modification_summary" TEXT,
    "reason_codes" JSONB,
    "reason_text" TEXT,
    "material_change" BOOLEAN NOT NULL DEFAULT false,
    "change_types" JSONB,
    "change_evidence" TEXT,
    "valuable_but_not_adopted" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" VARCHAR(64),
    "submitted_by" VARCHAR(255) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "second_order_intent" VARCHAR(32),
    "outcome_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_advisor_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_advisor_decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gate1_advisor_decisions_selected_candidate_id_fkey" FOREIGN KEY ("selected_candidate_id") REFERENCES "gate1_candidate_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_advisor_decisions_project_id_idx" ON "gate1_advisor_decisions"("project_id");

CREATE TABLE IF NOT EXISTS "gate1_manual_work_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task_type" VARCHAR(64) NOT NULL,
    "assignee_id" VARCHAR(255) NOT NULL,
    "artifact_ref" VARCHAR(128),
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "minutes" INTEGER,
    "status" VARCHAR(32) NOT NULL DEFAULT 'LOGGED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_manual_work_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_manual_work_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_manual_work_logs_project_id_task_type_idx" ON "gate1_manual_work_logs"("project_id", "task_type");

CREATE TABLE IF NOT EXISTS "gate1_access_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "actor_id" VARCHAR(255) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "resource_type" VARCHAR(64) NOT NULL,
    "resource_id" VARCHAR(128),
    "field_key" VARCHAR(64),
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_access_audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_access_audit_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_access_audit_logs_project_id_actor_id_idx" ON "gate1_access_audit_logs"("project_id", "actor_id");
CREATE INDEX IF NOT EXISTS "gate1_access_audit_logs_created_at_idx" ON "gate1_access_audit_logs"("created_at" DESC);

CREATE TABLE IF NOT EXISTS "gate1_analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "cohort" VARCHAR(32) NOT NULL,
    "event_name" VARCHAR(64) NOT NULL,
    "actor_id" VARCHAR(255),
    "participant_id" UUID,
    "organization_id" UUID,
    "properties" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_analytics_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_analytics_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_analytics_events_project_id_event_name_idx" ON "gate1_analytics_events"("project_id", "event_name");
CREATE INDEX IF NOT EXISTS "gate1_analytics_events_cohort_event_name_idx" ON "gate1_analytics_events"("cohort", "event_name");
