-- Reputation OS P2: post-trip survey campaigns, submissions, user aggregates

CREATE TABLE IF NOT EXISTS "reputation_survey_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "participant_ids" JSONB NOT NULL,
    "trigger_at" TIMESTAMPTZ(6) NOT NULL,
    "destination_label" VARCHAR(255),
    "trip_end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_survey_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reputation_survey_campaigns_post_id_key"
    ON "reputation_survey_campaigns"("post_id");
CREATE INDEX IF NOT EXISTS "reputation_survey_campaigns_status_idx"
    ON "reputation_survey_campaigns"("status");
CREATE INDEX IF NOT EXISTS "reputation_survey_campaigns_trigger_at_idx"
    ON "reputation_survey_campaigns"("trigger_at");

ALTER TABLE "reputation_survey_campaigns"
    ADD CONSTRAINT "reputation_survey_campaigns_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "match_square_recruitment_posts"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "reputation_survey_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "reviewer_user_id" VARCHAR(255) NOT NULL,
    "reviewee_user_id" VARCHAR(255) NOT NULL,
    "q1_overall" INTEGER NOT NULL,
    "q2_pace_sync" INTEGER NOT NULL,
    "q3_communication" INTEGER NOT NULL,
    "q4_spending" INTEGER NOT NULL,
    "q5_would_again" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_survey_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reputation_survey_submissions_campaign_id_reviewer_user_id_reviewee_user_id_key"
    ON "reputation_survey_submissions"("campaign_id", "reviewer_user_id", "reviewee_user_id");
CREATE INDEX IF NOT EXISTS "reputation_survey_submissions_reviewee_user_id_idx"
    ON "reputation_survey_submissions"("reviewee_user_id");
CREATE INDEX IF NOT EXISTS "reputation_survey_submissions_reviewer_user_id_idx"
    ON "reputation_survey_submissions"("reviewer_user_id");

ALTER TABLE "reputation_survey_submissions"
    ADD CONSTRAINT "reputation_survey_submissions_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "reputation_survey_campaigns"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "user_reputation_profiles" (
    "user_id" VARCHAR(255) NOT NULL,
    "average_stars" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "survey_count" INTEGER NOT NULL DEFAULT 0,
    "tag_cloud" JSONB NOT NULL DEFAULT '[]',
    "safety_warning" VARCHAR(500),
    "internal_risk_level" VARCHAR(20) NOT NULL DEFAULT 'none',
    "severe_low_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reputation_profiles_pkey" PRIMARY KEY ("user_id")
);
