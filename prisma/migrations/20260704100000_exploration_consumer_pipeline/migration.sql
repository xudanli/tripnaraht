-- Exploration Consumer Pipeline + Research (Sprint 0.5–4B)
-- Safe additive migration: CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "exploration_scenarios" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "research_protocol_id" VARCHAR(64),
    "participant_code" VARCHAR(64),
    "initial_input" JSONB NOT NULL,
    "assigned_variant" VARCHAR(32),
    "trip_id" TEXT,
    "materialized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exploration_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "exploration_scenarios_user_id_status_idx" ON "exploration_scenarios"("user_id", "status");
CREATE INDEX IF NOT EXISTS "exploration_scenarios_trip_id_idx" ON "exploration_scenarios"("trip_id");

DO $$ BEGIN
  ALTER TABLE "exploration_scenarios" ADD CONSTRAINT "exploration_scenarios_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "product_discovery_sessions" (
    "id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "participant_code" VARCHAR(64),
    "protocol_id" VARCHAR(64) NOT NULL,
    "entry_variant" VARCHAR(32),
    "metadata" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_discovery_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_discovery_sessions_scenario_id_key" ON "product_discovery_sessions"("scenario_id");
CREATE INDEX IF NOT EXISTS "product_discovery_sessions_user_id_idx" ON "product_discovery_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "product_discovery_sessions_protocol_id_idx" ON "product_discovery_sessions"("protocol_id");

DO $$ BEGIN
  ALTER TABLE "product_discovery_sessions" ADD CONSTRAINT "product_discovery_sessions_scenario_id_fkey"
    FOREIGN KEY ("scenario_id") REFERENCES "exploration_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "research_events" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "event_name" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "research_events_session_id_occurred_at_idx" ON "research_events"("session_id", "occurred_at");

DO $$ BEGIN
  ALTER TABLE "research_events" ADD CONSTRAINT "research_events_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "product_discovery_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "product_discovery_package_feedback" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "presentation_order" JSONB NOT NULL,
    "package_rankings" JSONB NOT NULL,
    "value_scores" JSONB NOT NULL,
    "trust_scores" JSONB NOT NULL,
    "acceptable_price_usd" JSONB,
    "least_preferred_package_id" VARCHAR(64),
    "preferred_package_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_discovery_package_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_discovery_package_feedback_session_id_key" ON "product_discovery_package_feedback"("session_id");

DO $$ BEGIN
  ALTER TABLE "product_discovery_package_feedback" ADD CONSTRAINT "product_discovery_package_feedback_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "product_discovery_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "product_discovery_commitments" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "commitment_type" VARCHAR(32) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_discovery_commitments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "product_discovery_commitments_session_id_commitment_type_idx" ON "product_discovery_commitments"("session_id", "commitment_type");

DO $$ BEGIN
  ALTER TABLE "product_discovery_commitments" ADD CONSTRAINT "product_discovery_commitments_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "product_discovery_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "research_contact_info" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "research_contact_info_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "research_contact_info_session_id_key" ON "research_contact_info"("session_id");

DO $$ BEGIN
  ALTER TABLE "research_contact_info" ADD CONSTRAINT "research_contact_info_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "product_discovery_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "research_payment_records" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "payment_kind" VARCHAR(32) NOT NULL,
    "sku_id" VARCHAR(64) NOT NULL,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "stripe_payment_intent_id" VARCHAR(128),
    "client_secret" VARCHAR(256),
    "price_lock_usd" INTEGER,
    "refunded_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "research_payment_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "research_payment_records_stripe_payment_intent_id_key" ON "research_payment_records"("stripe_payment_intent_id");
CREATE INDEX IF NOT EXISTS "research_payment_records_session_id_payment_kind_idx" ON "research_payment_records"("session_id", "payment_kind");
CREATE INDEX IF NOT EXISTS "research_payment_records_user_id_idx" ON "research_payment_records"("user_id");

DO $$ BEGIN
  ALTER TABLE "research_payment_records" ADD CONSTRAINT "research_payment_records_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "product_discovery_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "exploration_route_variants" (
    "id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "route_id" VARCHAR(64) NOT NULL,
    "strategy_id" VARCHAR(64) NOT NULL,
    "variant_branch_key" VARCHAR(64) NOT NULL,
    "itinerary_version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200),
    "narrative" TEXT,
    "metrics" JSONB,
    "gains" JSONB,
    "sacrifices" JSONB,
    "generation_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exploration_route_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exploration_route_variants_scenario_id_route_id_key" ON "exploration_route_variants"("scenario_id", "route_id");
CREATE INDEX IF NOT EXISTS "exploration_route_variants_trip_id_idx" ON "exploration_route_variants"("trip_id");

DO $$ BEGIN
  ALTER TABLE "exploration_route_variants" ADD CONSTRAINT "exploration_route_variants_scenario_id_fkey"
    FOREIGN KEY ("scenario_id") REFERENCES "exploration_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
