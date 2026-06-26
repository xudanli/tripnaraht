-- R0/R1: project membership sync support + professional certification + agency flows

CREATE TABLE IF NOT EXISTS "professional_profiles" (
    "user_id" UUID NOT NULL,
    "bio" TEXT,
    "destinations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "years_of_experience" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE IF NOT EXISTS "professional_certifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
    "materials" JSONB,
    "review_notes" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "professional_certifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "professional_certifications_user_id_status_idx"
    ON "professional_certifications"("user_id", "status");
CREATE INDEX IF NOT EXISTS "professional_certifications_status_updated_at_idx"
    ON "professional_certifications"("status", "updated_at" DESC);

ALTER TABLE "professional_profiles"
    ADD CONSTRAINT "professional_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "professional_certifications"
    ADD CONSTRAINT "professional_certifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
