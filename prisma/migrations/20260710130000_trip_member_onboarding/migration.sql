ALTER TABLE "trip_member_invites"
    ADD COLUMN IF NOT EXISTS "accepted_by_user_id" TEXT,
    ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "collaborator_id" TEXT;

CREATE TABLE IF NOT EXISTS "trip_member_onboarding_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invite_id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "current_step_id" VARCHAR(64),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_member_onboarding_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_member_onboarding_drafts_invite_id_key" UNIQUE ("invite_id"),
    CONSTRAINT "trip_member_onboarding_drafts_invite_id_fkey"
        FOREIGN KEY ("invite_id") REFERENCES "trip_member_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "trip_member_onboarding_drafts_trip_id_user_id_idx"
    ON "trip_member_onboarding_drafts"("trip_id", "user_id");
