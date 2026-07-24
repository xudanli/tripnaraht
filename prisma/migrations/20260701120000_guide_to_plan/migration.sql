-- Guide-to-Plan Pipeline（从攻略开始规划）

CREATE TABLE IF NOT EXISTS "guide_to_plan_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'collecting',
    "country_code" VARCHAR(8),
    "destination" VARCHAR(200),
    "travel_context" JSONB,
    "understanding_summary" JSONB,
    "theme_narrative" TEXT,
    "trip_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guide_to_plan_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "imported_guides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "title" VARCHAR(500),
    "source_type" VARCHAR(16) NOT NULL,
    "source_url" TEXT,
    "source_platform" VARCHAR(32),
    "raw_content" TEXT,
    "ocr_text" TEXT,
    "image_url" TEXT,
    "parse_status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "source_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "credibility_level" VARCHAR(4) NOT NULL DEFAULT 'L1',
    "extracted_places" JSONB,
    "extracted_routes" JSONB,
    "extracted_tips" JSONB,
    "implicit_assumptions" JSONB,
    "parse_error" TEXT,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "imported_guides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guide_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "guide_id" UUID,
    "claim_type" VARCHAR(64) NOT NULL,
    "subject_type" VARCHAR(32),
    "subject_id" TEXT,
    "subject_name" VARCHAR(200),
    "statement" TEXT NOT NULL,
    "source" VARCHAR(32) NOT NULL DEFAULT 'guide_author',
    "confidence_level" VARCHAR(4) NOT NULL DEFAULT 'L1',
    "applicable_season" VARCHAR(32),
    "applicable_traveler" VARCHAR(64),
    "verification_status" VARCHAR(32) NOT NULL DEFAULT 'unverified',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guide_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guide_inspiration_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "source_guide_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "candidate_type" VARCHAR(32) NOT NULL,
    "raw_name" VARCHAR(200) NOT NULL,
    "raw_name_en" VARCHAR(200),
    "place_id" INTEGER,
    "match_status" VARCHAR(16) NOT NULL DEFAULT 'unmatched',
    "suggested_day" INTEGER,
    "route_order" INTEGER,
    "priority" VARCHAR(16) NOT NULL DEFAULT 'medium',
    "source_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guide_inspiration_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guide_plan_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "variant" VARCHAR(32) NOT NULL DEFAULT 'balanced',
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "source_guide_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "retained_items" JSONB NOT NULL DEFAULT '[]',
    "modified_items" JSONB NOT NULL DEFAULT '[]',
    "rejected_items" JSONB NOT NULL DEFAULT '[]',
    "decision_reasons" JSONB NOT NULL DEFAULT '[]',
    "comparison_diff" JSONB,
    "persona_opinions" JSONB,
    "itinerary_draft" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guide_plan_candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "guide_to_plan_sessions_user_id_status_idx"
    ON "guide_to_plan_sessions"("user_id", "status");
CREATE INDEX IF NOT EXISTS "guide_to_plan_sessions_trip_id_idx"
    ON "guide_to_plan_sessions"("trip_id");
CREATE INDEX IF NOT EXISTS "imported_guides_session_id_parse_status_idx"
    ON "imported_guides"("session_id", "parse_status");
CREATE INDEX IF NOT EXISTS "guide_claims_session_id_claim_type_idx"
    ON "guide_claims"("session_id", "claim_type");
CREATE INDEX IF NOT EXISTS "guide_claims_guide_id_idx"
    ON "guide_claims"("guide_id");
CREATE INDEX IF NOT EXISTS "guide_inspiration_candidates_session_id_candidate_type_idx"
    ON "guide_inspiration_candidates"("session_id", "candidate_type");
CREATE INDEX IF NOT EXISTS "guide_inspiration_candidates_session_id_match_status_idx"
    ON "guide_inspiration_candidates"("session_id", "match_status");
CREATE INDEX IF NOT EXISTS "guide_plan_candidates_session_id_status_idx"
    ON "guide_plan_candidates"("session_id", "status");

ALTER TABLE "guide_to_plan_sessions" DROP CONSTRAINT IF EXISTS "guide_to_plan_sessions_trip_id_fkey";
ALTER TABLE "guide_to_plan_sessions" ADD CONSTRAINT "guide_to_plan_sessions_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imported_guides" DROP CONSTRAINT IF EXISTS "imported_guides_session_id_fkey";
ALTER TABLE "imported_guides" ADD CONSTRAINT "imported_guides_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "guide_to_plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guide_claims" DROP CONSTRAINT IF EXISTS "guide_claims_session_id_fkey";
ALTER TABLE "guide_claims" ADD CONSTRAINT "guide_claims_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "guide_to_plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guide_claims" DROP CONSTRAINT IF EXISTS "guide_claims_guide_id_fkey";
ALTER TABLE "guide_claims" ADD CONSTRAINT "guide_claims_guide_id_fkey"
    FOREIGN KEY ("guide_id") REFERENCES "imported_guides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guide_inspiration_candidates" DROP CONSTRAINT IF EXISTS "guide_inspiration_candidates_session_id_fkey";
ALTER TABLE "guide_inspiration_candidates" ADD CONSTRAINT "guide_inspiration_candidates_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "guide_to_plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guide_plan_candidates" DROP CONSTRAINT IF EXISTS "guide_plan_candidates_session_id_fkey";
ALTER TABLE "guide_plan_candidates" ADD CONSTRAINT "guide_plan_candidates_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "guide_to_plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
