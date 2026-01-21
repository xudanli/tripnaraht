-- Migration: Add ValidatedTrajectory table for Iterative Deployment
-- Created: 2026-01-20
-- Description: Creates the validated_trajectories table for storing validated planning trajectories

-- CreateTable
CREATE TABLE IF NOT EXISTS "validated_trajectories" (
    "id" UUID NOT NULL,
    "trajectory_id" VARCHAR(255) NOT NULL,
    "request_id" VARCHAR(255) NOT NULL,
    "trip_id" UUID,
    "validation_status" VARCHAR(20) NOT NULL,
    "validation_score" DOUBLE PRECISION NOT NULL,
    "validation_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "plan" JSONB NOT NULL,
    "decision_trace" JSONB NOT NULL,
    "research_data" JSONB NOT NULL,
    "gate_result" JSONB NOT NULL,
    "compliance_result" JSONB NOT NULL,
    "total_reward" DOUBLE PRECISION DEFAULT 0,
    "reward_signals" JSONB DEFAULT '[]'::jsonb,
    "user_approval" VARCHAR(20),
    "execution_result" JSONB,
    "model_version" VARCHAR(50) DEFAULT 'v1.0',
    "country_code" VARCHAR(2),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_for_training" BOOLEAN DEFAULT false,
    "training_batch_id" VARCHAR(255),
    "used_for_training_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "validated_trajectories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "validated_trajectories_trajectory_id_key" ON "validated_trajectories"("trajectory_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "validated_trajectories_validation_status_idx" ON "validated_trajectories"("validation_status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "validated_trajectories_validation_score_idx" ON "validated_trajectories"("validation_score");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "validated_trajectories_used_for_training_idx" ON "validated_trajectories"("used_for_training");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "validated_trajectories_country_code_validation_status_idx" ON "validated_trajectories"("country_code", "validation_status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "validated_trajectories_request_id_idx" ON "validated_trajectories"("request_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "validated_trajectories_trip_id_idx" ON "validated_trajectories"("trip_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "validated_trajectories_model_version_idx" ON "validated_trajectories"("model_version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "validated_trajectories_training_batch_id_idx" ON "validated_trajectories"("training_batch_id");
