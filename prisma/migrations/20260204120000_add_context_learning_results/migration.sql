-- CreateTable: Add context_learning_results table for Context Learning Skill
-- This migration adds a table to store learning results about context block importance,
-- relevance, usage, and user feedback.

CREATE TABLE IF NOT EXISTS "context_learning_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255),
    "trip_id" UUID,
    "event_type" VARCHAR(50) NOT NULL,
    "block_key" VARCHAR(100) NOT NULL,
    "block_type" VARCHAR(50) NOT NULL,
    "importance_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "relevance_score" DOUBLE PRECISION,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "positive_feedback_count" INTEGER NOT NULL DEFAULT 0,
    "negative_feedback_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sample_size" INTEGER NOT NULL DEFAULT 0,
    "phase" VARCHAR(50),
    "agent" VARCHAR(50),
    "user_query" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_learning_results_pkey" PRIMARY KEY ("id")
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS "context_learning_results_user_id_idx" ON "context_learning_results"("user_id");
CREATE INDEX IF NOT EXISTS "context_learning_results_trip_id_idx" ON "context_learning_results"("trip_id");
CREATE INDEX IF NOT EXISTS "context_learning_results_block_key_idx" ON "context_learning_results"("block_key");
CREATE INDEX IF NOT EXISTS "context_learning_results_block_type_idx" ON "context_learning_results"("block_type");
CREATE INDEX IF NOT EXISTS "context_learning_results_event_type_idx" ON "context_learning_results"("event_type");
CREATE INDEX IF NOT EXISTS "context_learning_results_phase_idx" ON "context_learning_results"("phase");
CREATE INDEX IF NOT EXISTS "context_learning_results_agent_idx" ON "context_learning_results"("agent");
CREATE INDEX IF NOT EXISTS "context_learning_results_importance_score_idx" ON "context_learning_results"("importance_score");
CREATE INDEX IF NOT EXISTS "context_learning_results_confidence_idx" ON "context_learning_results"("confidence");
CREATE INDEX IF NOT EXISTS "context_learning_results_created_at_idx" ON "context_learning_results"("created_at" DESC);
