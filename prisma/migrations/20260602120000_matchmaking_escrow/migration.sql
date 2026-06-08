-- Matchmaking: blind listings, requests, escrow (Phase 3)

CREATE TABLE IF NOT EXISTS "matchmaking_blind_listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "destination_scope" VARCHAR(255),
    "persona_vector" JSONB NOT NULL,
    "trust_signals" JSONB NOT NULL DEFAULT '{}',
    "encrypted_private_profile" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matchmaking_blind_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "matchmaking_blind_listings_user_id_key"
    ON "matchmaking_blind_listings"("user_id");
CREATE INDEX IF NOT EXISTS "matchmaking_blind_listings_destination_scope_idx"
    ON "matchmaking_blind_listings"("destination_scope");
CREATE INDEX IF NOT EXISTS "matchmaking_blind_listings_is_active_idx"
    ON "matchmaking_blind_listings"("is_active");

CREATE TABLE IF NOT EXISTS "matchmaking_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_user_id" VARCHAR(255) NOT NULL,
    "target_listing_id" UUID NOT NULL,
    "target_user_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "requester_consent_id" UUID,
    "target_consent_id" UUID,
    "coordination_hints" JSONB,
    "revealed_at" TIMESTAMPTZ(6),
    "trip_departure_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matchmaking_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "matchmaking_requests_target_listing_id_fkey"
        FOREIGN KEY ("target_listing_id") REFERENCES "matchmaking_blind_listings"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "matchmaking_requests_requester_user_id_idx"
    ON "matchmaking_requests"("requester_user_id");
CREATE INDEX IF NOT EXISTS "matchmaking_requests_target_user_id_idx"
    ON "matchmaking_requests"("target_user_id");
CREATE INDEX IF NOT EXISTS "matchmaking_requests_status_idx"
    ON "matchmaking_requests"("status");

CREATE TABLE IF NOT EXISTS "matchmaking_escrows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'cny',
    "status" VARCHAR(30) NOT NULL,
    "payment_intent_id" VARCHAR(255),
    "stripe_reference" VARCHAR(255),
    "locked_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "forfeited_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matchmaking_escrows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "matchmaking_escrows_request_id_fkey"
        FOREIGN KEY ("request_id") REFERENCES "matchmaking_requests"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "matchmaking_escrows_request_id_user_id_key"
    ON "matchmaking_escrows"("request_id", "user_id");
CREATE INDEX IF NOT EXISTS "matchmaking_escrows_request_id_idx"
    ON "matchmaking_escrows"("request_id");
CREATE INDEX IF NOT EXISTS "matchmaking_escrows_status_idx"
    ON "matchmaking_escrows"("status");
