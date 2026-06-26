-- Participant Portal P1: member tasks, change notices, light account binding

CREATE TABLE IF NOT EXISTS "gate1_participant_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "task_type" VARCHAR(32) NOT NULL DEFAULT 'READINESS',
    "category" VARCHAR(32) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "priority" VARCHAR(8) NOT NULL DEFAULT 'P1',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "due_at" TIMESTAMPTZ(6),
    "status" VARCHAR(16) NOT NULL DEFAULT 'NOT_STARTED',
    "evidence" JSONB,
    "completed_at" TIMESTAMPTZ(6),
    "waived_at" TIMESTAMPTZ(6),
    "waived_by" VARCHAR(255),
    "waive_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_participant_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_participant_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gate1_participant_tasks_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "gate1_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_participant_tasks_participant_id_status_idx"
  ON "gate1_participant_tasks"("participant_id", "status");
CREATE INDEX IF NOT EXISTS "gate1_participant_tasks_project_id_idx"
  ON "gate1_participant_tasks"("project_id");

CREATE TABLE IF NOT EXISTS "gate1_change_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "severity" VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
    "title" VARCHAR(255) NOT NULL,
    "what_happened" TEXT NOT NULL,
    "impact_summary" TEXT,
    "action_required" TEXT,
    "deadline" TIMESTAMPTZ(6),
    "plan_b_id" UUID,
    "travel_event_id" UUID,
    "requires_ack" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_change_notices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_change_notices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gate1_change_notices_plan_b_id_fkey" FOREIGN KEY ("plan_b_id") REFERENCES "gate1_plan_b"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gate1_change_notices_travel_event_id_fkey" FOREIGN KEY ("travel_event_id") REFERENCES "gate1_travel_events"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_change_notices_project_id_idx"
  ON "gate1_change_notices"("project_id");

CREATE TABLE IF NOT EXISTS "gate1_change_notice_acks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "change_notice_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "help_requested" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_change_notice_acks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_change_notice_acks_change_notice_id_fkey" FOREIGN KEY ("change_notice_id") REFERENCES "gate1_change_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gate1_change_notice_acks_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "gate1_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_change_notice_acks_notice_participant_key"
  ON "gate1_change_notice_acks"("change_notice_id", "participant_id");
