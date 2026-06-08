-- PRD v1.1 Wave 1: 12 维隐式特征向量 SSOT

CREATE TABLE IF NOT EXISTS "user_psychographic_vectors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "trip_run_id" UUID,
    "request_id" VARCHAR(255),
    "schema_version" INTEGER NOT NULL DEFAULT 11,
    "dimension_keys" JSONB NOT NULL,
    "vector" JSONB NOT NULL,
    "filled_mask" JSONB NOT NULL,
    "artifact" JSONB NOT NULL,
    "embedding" vector(12),
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "intake_round" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_psychographic_vectors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_psychographic_vectors_user_id_request_id_key"
    ON "user_psychographic_vectors"("user_id", "request_id");
CREATE INDEX IF NOT EXISTS "user_psychographic_vectors_user_id_idx"
    ON "user_psychographic_vectors"("user_id");
CREATE INDEX IF NOT EXISTS "user_psychographic_vectors_trip_run_id_idx"
    ON "user_psychographic_vectors"("trip_run_id");
