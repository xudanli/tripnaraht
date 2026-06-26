-- Project Fit → Participant Portal bridge + notification outbox

ALTER TABLE "trusted_project_listings"
  ADD COLUMN IF NOT EXISTS "gate1_project_id" UUID;

ALTER TABLE "trusted_project_applications"
  ADD COLUMN IF NOT EXISTS "gate1_participant_id" UUID;

ALTER TABLE "gate1_participants"
  ADD COLUMN IF NOT EXISTS "trusted_application_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_participants_trusted_application_id_key"
  ON "gate1_participants"("trusted_application_id")
  WHERE "trusted_application_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "gate1_notification_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID,
    "participant_id" UUID,
    "user_id" VARCHAR(255),
    "channel" VARCHAR(16) NOT NULL DEFAULT 'EMAIL',
    "event_type" VARCHAR(64) NOT NULL,
    "dedupe_key" VARCHAR(128) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "recipient" VARCHAR(255),
    "status" VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate1_notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate1_notification_outbox_dedupe_key"
  ON "gate1_notification_outbox"("event_type", "dedupe_key");
CREATE INDEX IF NOT EXISTS "gate1_notification_outbox_status_idx"
  ON "gate1_notification_outbox"("status", "created_at");
