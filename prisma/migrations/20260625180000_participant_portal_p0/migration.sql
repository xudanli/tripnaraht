-- Participant Portal P0: layered consent types, JOINED lifecycle, proposal feedback

ALTER TABLE "gate1_participants"
  ADD COLUMN IF NOT EXISTS "user_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "role" VARCHAR(32) NOT NULL DEFAULT 'PARTICIPANT',
  ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMPTZ(6);

ALTER TABLE "gate1_consent_records"
  ADD COLUMN IF NOT EXISTS "consent_type" VARCHAR(32);

UPDATE "gate1_consent_records"
SET "consent_type" = 'LEGACY_BUNDLED'
WHERE "consent_type" IS NULL AND "status" = 'GRANTED';

CREATE TABLE IF NOT EXISTS "gate1_proposal_feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "candidate_strategy_id" UUID NOT NULL,
    "candidate_version" INTEGER NOT NULL,
    "response" VARCHAR(32) NOT NULL,
    "reason_type" VARCHAR(64),
    "note" TEXT,
    "private_note" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'SUBMITTED',
    "invalidated_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gate1_proposal_feedbacks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gate1_proposal_feedbacks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "gate1_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gate1_proposal_feedbacks_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "gate1_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gate1_proposal_feedbacks_candidate_strategy_id_fkey" FOREIGN KEY ("candidate_strategy_id") REFERENCES "gate1_candidate_strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_proposal_feedbacks_participant_candidate_key"
  ON "gate1_proposal_feedbacks"("participant_id", "candidate_strategy_id");
CREATE INDEX IF NOT EXISTS "gate1_proposal_feedbacks_project_id_status_idx"
  ON "gate1_proposal_feedbacks"("project_id", "status");
