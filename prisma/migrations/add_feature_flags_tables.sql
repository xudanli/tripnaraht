-- Migration: Add Feature Flags Tables
-- Created: 2026-01-26
-- Description: Add UserFeatureFlag and GlobalFeatureFlag tables for readiness AI enhancement feature flags

-- Create UserFeatureFlag table
CREATE TABLE IF NOT EXISTS "user_feature_flags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "feature" VARCHAR(100) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_feature_flag_user_feature_unique" UNIQUE ("user_id", "feature")
);

-- Create indexes for UserFeatureFlag
CREATE INDEX IF NOT EXISTS "user_feature_flags_feature_enabled_idx" ON "user_feature_flags" ("feature", "enabled");
CREATE INDEX IF NOT EXISTS "user_feature_flags_user_id_idx" ON "user_feature_flags" ("user_id");

-- Add foreign key constraint
ALTER TABLE "user_feature_flags"
  ADD CONSTRAINT "user_feature_flags_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

-- Create GlobalFeatureFlag table
CREATE TABLE IF NOT EXISTS "global_feature_flags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "feature" VARCHAR(100) NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for GlobalFeatureFlag
CREATE INDEX IF NOT EXISTS "global_feature_flags_enabled_idx" ON "global_feature_flags" ("enabled");

-- Insert default global feature flag (disabled by default)
INSERT INTO "global_feature_flags" ("feature", "enabled", "metadata")
VALUES ('readiness_ai_enhancement', false, '{"description": "AI enhancement for readiness check", "default": false}')
ON CONFLICT ("feature") DO NOTHING;
