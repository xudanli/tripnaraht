-- Match Square P1: recruitment applications

CREATE TABLE IF NOT EXISTS "match_square_recruitment_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "applicant_user_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "message" VARCHAR(200) NOT NULL,
    "planning_commitment_accepted" BOOLEAN NOT NULL DEFAULT false,
    "applicant_display_name" VARCHAR(255),
    "applicant_mbti_type" VARCHAR(8) NOT NULL,
    "applicant_card_title" VARCHAR(255) NOT NULL,
    "applicant_interaction_mode" VARCHAR(50) NOT NULL,
    "applicant_reputation_stars" DOUBLE PRECISION,
    "applicant_persona_snapshot" JSONB NOT NULL,
    "compatibility_percent" INTEGER NOT NULL,
    "match_highlights" JSONB NOT NULL DEFAULT '[]',
    "match_warnings" JSONB NOT NULL DEFAULT '[]',
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_square_recruitment_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_square_recruitment_applications_post_id_fkey"
        FOREIGN KEY ("post_id") REFERENCES "match_square_recruitment_posts"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "match_square_recruitment_applications_post_id_idx"
    ON "match_square_recruitment_applications"("post_id");
CREATE INDEX IF NOT EXISTS "match_square_recruitment_applications_applicant_user_id_idx"
    ON "match_square_recruitment_applications"("applicant_user_id");
CREATE INDEX IF NOT EXISTS "match_square_recruitment_applications_status_idx"
    ON "match_square_recruitment_applications"("status");
