-- Silent Vote (anonymous group preference voting)
CREATE TABLE IF NOT EXISTS "trip_silent_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "options" JSONB NOT NULL,
    "closes_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_silent_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_silent_votes_trip_id_fkey"
        FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "trip_silent_votes_trip_id_status_idx"
    ON "trip_silent_votes" ("trip_id", "status");

CREATE TABLE IF NOT EXISTS "trip_silent_vote_ballots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vote_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "intensity" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_silent_vote_ballots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_silent_vote_ballots_vote_id_fkey"
        FOREIGN KEY ("vote_id") REFERENCES "trip_silent_votes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trip_silent_vote_ballots_vote_id_user_id_key" UNIQUE ("vote_id", "user_id"),
    CONSTRAINT "trip_silent_vote_ballots_intensity_check"
        CHECK ("intensity" >= 1 AND "intensity" <= 5)
);

CREATE INDEX IF NOT EXISTS "trip_silent_vote_ballots_vote_id_idx"
    ON "trip_silent_vote_ballots" ("vote_id");
