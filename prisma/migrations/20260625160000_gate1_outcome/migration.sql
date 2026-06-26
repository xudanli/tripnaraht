-- Gate 1 V0.3: Outcome loop (travel events, project outcome, participant feedback)

CREATE TABLE IF NOT EXISTS "gate1_travel_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "event_type" VARCHAR(32) NOT NULL DEFAULT 'INCIDENT',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "handler" VARCHAR(128),
    "result" TEXT,
    "responsible_party" VARCHAR(128),
    "plan_b_id" UUID,
    "metadata" JSONB,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_travel_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_travel_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gate1_travel_events_plan_b_id_fkey" FOREIGN KEY ("plan_b_id") REFERENCES "gate1_plan_b"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "gate1_travel_events_project_id_occurred_at_idx" ON "gate1_travel_events"("project_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "gate1_project_outcomes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "value_rating" INTEGER,
    "value_notes" TEXT,
    "second_order_intent" VARCHAR(32),
    "second_order_provided" BOOLEAN NOT NULL DEFAULT false,
    "payment_commitment_cents" INTEGER,
    "payment_commitment_type" VARCHAR(32),
    "payment_notes" TEXT,
    "client_revision_rounds" INTEGER,
    "advisor_actual_hours" DOUBLE PRECISION,
    "exception_cost_cents" INTEGER,
    "submitted_by" VARCHAR(255) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_project_outcomes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_project_outcomes_project_id_key" UNIQUE ("project_id"),
    CONSTRAINT "gate1_project_outcomes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "gate1_participant_feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "rating" INTEGER,
    "would_recommend" BOOLEAN,
    "comment" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_participant_feedbacks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gate1_participant_feedbacks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gate1_participant_feedbacks_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "gate1_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_participant_feedbacks_participant_id_key" ON "gate1_participant_feedbacks"("participant_id");
CREATE INDEX IF NOT EXISTS "gate1_participant_feedbacks_project_id_idx" ON "gate1_participant_feedbacks"("project_id");
