-- Match Square 3.7: travel intent signals + olive branch invitations

CREATE TABLE IF NOT EXISTS "match_square_travel_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "destination_scope" VARCHAR(255) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "budget_flex" VARCHAR(30) NOT NULL DEFAULT 'flexible',
    "open_to_carpool" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(500),
    "capability_tags" JSONB NOT NULL DEFAULT '[]',
    "persona_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_square_travel_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "match_square_travel_intents_user_id_key"
    ON "match_square_travel_intents"("user_id");
CREATE INDEX IF NOT EXISTS "match_square_travel_intents_status_idx"
    ON "match_square_travel_intents"("status");
CREATE INDEX IF NOT EXISTS "match_square_travel_intents_destination_scope_idx"
    ON "match_square_travel_intents"("destination_scope");
CREATE INDEX IF NOT EXISTS "match_square_travel_intents_start_date_end_date_idx"
    ON "match_square_travel_intents"("start_date", "end_date");

CREATE TABLE IF NOT EXISTS "match_square_olive_branch_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "captain_user_id" VARCHAR(255) NOT NULL,
    "invitee_user_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "compatibility_percent" INTEGER NOT NULL,
    "invite_message" VARCHAR(500),
    "radar_highlights" JSONB NOT NULL DEFAULT '[]',
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_square_olive_branch_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "match_square_olive_branch_invitations_post_id_invitee_user_id_key"
    ON "match_square_olive_branch_invitations"("post_id", "invitee_user_id");
CREATE INDEX IF NOT EXISTS "match_square_olive_branch_invitations_captain_user_id_idx"
    ON "match_square_olive_branch_invitations"("captain_user_id");
CREATE INDEX IF NOT EXISTS "match_square_olive_branch_invitations_invitee_user_id_idx"
    ON "match_square_olive_branch_invitations"("invitee_user_id");
CREATE INDEX IF NOT EXISTS "match_square_olive_branch_invitations_status_idx"
    ON "match_square_olive_branch_invitations"("status");

ALTER TABLE "match_square_olive_branch_invitations"
    ADD CONSTRAINT "match_square_olive_branch_invitations_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "match_square_recruitment_posts"("id") ON DELETE CASCADE;
