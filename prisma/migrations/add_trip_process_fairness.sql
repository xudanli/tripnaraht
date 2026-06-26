-- Process Fairness Tool (F3.1 Round Robin + F3.3 participation foundation)

CREATE TABLE IF NOT EXISTS "trip_preference_rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "domain" VARCHAR(32) NOT NULL,
    "decision_node" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'collecting',
    "turn_order" JSONB NOT NULL,
    "current_turn" INTEGER NOT NULL DEFAULT 0,
    "closes_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_preference_rounds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_preference_rounds_trip_id_fkey"
        FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "trip_preference_rounds_trip_domain_status_idx"
    ON "trip_preference_rounds" ("trip_id", "domain", "status");

CREATE TABLE IF NOT EXISTS "trip_preference_utterances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "modality" VARCHAR(16) NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "reason" TEXT,
    "via_proxy" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_preference_utterances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_preference_utterances_round_id_fkey"
        FOREIGN KEY ("round_id") REFERENCES "trip_preference_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trip_preference_utterances_round_user_key" UNIQUE ("round_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "trip_preference_utterances_round_id_idx"
    ON "trip_preference_utterances" ("round_id");

CREATE TABLE IF NOT EXISTS "trip_preference_heard_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "voter_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "heard" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_preference_heard_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_preference_heard_votes_round_id_fkey"
        FOREIGN KEY ("round_id") REFERENCES "trip_preference_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trip_preference_heard_votes_round_voter_target_key"
        UNIQUE ("round_id", "voter_id", "target_user_id")
);

CREATE INDEX IF NOT EXISTS "trip_preference_heard_votes_round_target_idx"
    ON "trip_preference_heard_votes" ("round_id", "target_user_id");

CREATE TABLE IF NOT EXISTS "trip_member_participations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "preference_submits" INTEGER NOT NULL DEFAULT 0,
    "vote_participations" INTEGER NOT NULL DEFAULT 0,
    "discussion_utterances" INTEGER NOT NULL DEFAULT 0,
    "consecutive_silent_rounds" INTEGER NOT NULL DEFAULT 0,
    "last_spoke_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_member_participations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_member_participations_trip_id_fkey"
        FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trip_member_participations_trip_user_key" UNIQUE ("trip_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "trip_member_participations_trip_id_idx"
    ON "trip_member_participations" ("trip_id");
