-- Match Square P0: structured recruitment posts for 搭子广场

CREATE TABLE IF NOT EXISTS "match_square_recruitment_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "captain_user_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "destination" VARCHAR(255) NOT NULL,
    "departure_label" VARCHAR(255),
    "destination_lat" DOUBLE PRECISION,
    "destination_lng" DOUBLE PRECISION,
    "destination_poi_id" VARCHAR(255),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "itinerary_summary" VARCHAR(500) NOT NULL,
    "budget_min_cents" INTEGER,
    "budget_max_cents" INTEGER,
    "slots_needed" INTEGER NOT NULL,
    "slots_filled" INTEGER NOT NULL DEFAULT 0,
    "preference_notes" TEXT,
    "trip_mood_tag" VARCHAR(30),
    "travel_mode" VARCHAR(30),
    "vehicle_info" VARCHAR(500),
    "captain_message" VARCHAR(500),
    "captain_mbti_type" VARCHAR(8) NOT NULL,
    "captain_card_title" VARCHAR(255) NOT NULL,
    "captain_interaction_mode" VARCHAR(50) NOT NULL,
    "captain_reputation_stars" DOUBLE PRECISION,
    "captain_persona_snapshot" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_square_recruitment_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "match_square_recruitment_posts_status_idx"
    ON "match_square_recruitment_posts"("status");
CREATE INDEX IF NOT EXISTS "match_square_recruitment_posts_destination_idx"
    ON "match_square_recruitment_posts"("destination");
CREATE INDEX IF NOT EXISTS "match_square_recruitment_posts_start_date_end_date_idx"
    ON "match_square_recruitment_posts"("start_date", "end_date");
CREATE INDEX IF NOT EXISTS "match_square_recruitment_posts_captain_user_id_idx"
    ON "match_square_recruitment_posts"("captain_user_id");
CREATE INDEX IF NOT EXISTS "match_square_recruitment_posts_captain_mbti_type_idx"
    ON "match_square_recruitment_posts"("captain_mbti_type");
CREATE INDEX IF NOT EXISTS "match_square_recruitment_posts_captain_interaction_mode_idx"
    ON "match_square_recruitment_posts"("captain_interaction_mode");
