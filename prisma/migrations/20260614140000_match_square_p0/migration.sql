-- Match Square P0 — recruitment posts and applications

CREATE TABLE "match_square_posts" (
    "id" UUID NOT NULL,
    "captain_user_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "destination" TEXT NOT NULL,
    "departure_label" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "itinerary_summary" TEXT NOT NULL DEFAULT '',
    "captain_message" TEXT NOT NULL DEFAULT '',
    "recruitment_vision" TEXT,
    "budget_min_cents" INTEGER,
    "budget_max_cents" INTEGER,
    "slots_needed" INTEGER NOT NULL DEFAULT 1,
    "planning_style" VARCHAR(32),
    "trip_mood_tag" VARCHAR(16),
    "travel_mode" VARCHAR(32),
    "vehicle_info" TEXT,
    "preference_notes" TEXT,
    "captain_mbti_type" VARCHAR(8),
    "captain_card_title" TEXT,
    "captain_interaction_mode" VARCHAR(32),
    "destination_lat" DOUBLE PRECISION,
    "destination_lng" DOUBLE PRECISION,
    "vibe_snapshot" JSONB,
    "route_direction_id" INTEGER,
    "route_direction_name" TEXT,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_square_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "match_square_applications" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "applicant_user_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "message" TEXT NOT NULL DEFAULT '',
    "planning_commitment_accepted" BOOLEAN NOT NULL DEFAULT false,
    "teamwork_commitment_accepted" BOOLEAN NOT NULL DEFAULT false,
    "target_slot_index" INTEGER,
    "target_slot_id" TEXT,
    "target_slot_label" TEXT,
    "applicant_mbti_type" VARCHAR(8),
    "applicant_card_title" TEXT,
    "applicant_interaction_mode" VARCHAR(32),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_square_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_square_applications_post_id_applicant_user_id_key"
    ON "match_square_applications"("post_id", "applicant_user_id");

CREATE INDEX "match_square_applications_post_id_status_idx"
    ON "match_square_applications"("post_id", "status");

CREATE INDEX "match_square_applications_applicant_user_id_idx"
    ON "match_square_applications"("applicant_user_id");

CREATE INDEX "match_square_posts_status_start_date_idx"
    ON "match_square_posts"("status", "start_date");

CREATE INDEX "match_square_posts_captain_user_id_idx"
    ON "match_square_posts"("captain_user_id");

ALTER TABLE "match_square_applications"
    ADD CONSTRAINT "match_square_applications_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "match_square_posts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
