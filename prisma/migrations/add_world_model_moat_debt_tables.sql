-- Migration: Add World Model Moat Debt Tables
-- Created: 2026-02-10
-- Description: Creates tables for technical debt items (user_contribution, expert_verification, world_model_versions)

-- ========== Phase 6: 协作世界模型 ==========

-- 用户贡献表
CREATE TABLE IF NOT EXISTS "user_contribution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL, -- 'ROAD_STATUS_REPORT', 'POI_STATUS_REPORT', 'WEATHER_REPORT', etc.
    "target_id" VARCHAR(100) NOT NULL, -- roadId, poiId, routeDirectionId等
    "data" JSONB NOT NULL,
    "quality_score" DOUBLE PRECISION, -- 0-1
    "verified_by_expert" BOOLEAN DEFAULT false,
    "expert_verification_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW'
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_contribution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_contribution_user_id_idx" ON "user_contribution"("user_id");
CREATE INDEX IF NOT EXISTS "user_contribution_target_id_idx" ON "user_contribution"("target_id");
CREATE INDEX IF NOT EXISTS "user_contribution_type_idx" ON "user_contribution"("type");
CREATE INDEX IF NOT EXISTS "user_contribution_status_idx" ON "user_contribution"("status");
CREATE INDEX IF NOT EXISTS "user_contribution_quality_score_idx" ON "user_contribution"("quality_score");
CREATE INDEX IF NOT EXISTS "user_contribution_created_at_idx" ON "user_contribution"("created_at");

-- 专家验证表
CREATE TABLE IF NOT EXISTS "expert_verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expert_id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "verification_result" VARCHAR(20) NOT NULL, -- 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION'
    "comments" TEXT,
    "quality_score" DOUBLE PRECISION, -- 0-1
    "confidence" DOUBLE PRECISION DEFAULT 0.9, -- 0-1
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expert_verification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expert_verification_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "user_contribution"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "expert_verification_expert_id_idx" ON "expert_verification"("expert_id");
CREATE INDEX IF NOT EXISTS "expert_verification_contribution_id_idx" ON "expert_verification"("contribution_id");
CREATE INDEX IF NOT EXISTS "expert_verification_result_idx" ON "expert_verification"("verification_result");
CREATE INDEX IF NOT EXISTS "expert_verification_created_at_idx" ON "expert_verification"("created_at");

-- 数据质量评分表
CREATE TABLE IF NOT EXISTS "data_quality_score" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contribution_id" UUID NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL, -- 0-1
    "completeness" DOUBLE PRECISION NOT NULL, -- 0-1
    "accuracy" DOUBLE PRECISION NOT NULL, -- 0-1
    "consistency" DOUBLE PRECISION NOT NULL, -- 0-1
    "reliability" DOUBLE PRECISION NOT NULL, -- 0-1
    "factors" TEXT[], -- 质量因素列表
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_score_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_quality_score_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "user_contribution"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "data_quality_score_contribution_id_idx" ON "data_quality_score"("contribution_id");
CREATE INDEX IF NOT EXISTS "data_quality_score_overall_score_idx" ON "data_quality_score"("overall_score");

-- ========== Phase 10: 世界模型版本管理 ==========

-- 世界模型版本表
CREATE TABLE IF NOT EXISTS "world_model_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" VARCHAR(100) NOT NULL UNIQUE,
    "version" VARCHAR(50) NOT NULL, -- 语义化版本号（如 "1.2.3"）
    "world_model" JSONB NOT NULL, -- 序列化的世界模型数据
    "metadata" JSONB NOT NULL, -- { description, createdBy, tags, countryCode, routeDirectionId }
    "is_active" BOOLEAN DEFAULT false,
    "performance_metrics" JSONB, -- { userSatisfaction, predictionAccuracy, usageCount, averageConfidence }
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_model_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "world_model_versions_version_id_idx" ON "world_model_versions"("version_id");
CREATE INDEX IF NOT EXISTS "world_model_versions_version_idx" ON "world_model_versions"("version");
CREATE INDEX IF NOT EXISTS "world_model_versions_is_active_idx" ON "world_model_versions"("is_active");
CREATE INDEX IF NOT EXISTS "world_model_versions_created_at_idx" ON "world_model_versions"("created_at");
CREATE INDEX IF NOT EXISTS "world_model_versions_metadata_idx" ON "world_model_versions" USING GIN ("metadata");

-- 添加route_direction_id和country_code字段的索引（如果metadata中包含）
-- 注意：这些字段在metadata JSONB中，可以通过GIN索引查询
