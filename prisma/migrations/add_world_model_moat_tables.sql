-- Migration: Add World Model Moat Extension Tables
-- Created: 2026-02-10
-- Description: Creates tables for user feedback learning, realtime world state, and predictions

-- ========== User Feedback Learning System ==========

-- 用户反馈表
CREATE TABLE IF NOT EXISTS "user_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feedback_type" VARCHAR(50) NOT NULL, -- 'TRIP_COMPLETED', 'POI_SKIPPED', 'DAY_FAILED', 'POI_ADDED'
    "feedback_data" JSONB NOT NULL,
    "quality_score" DOUBLE PRECISION, -- 数据质量评分（0-1）
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_feedback_trip_id_idx" ON "user_feedback"("trip_id");
CREATE INDEX IF NOT EXISTS "user_feedback_user_id_idx" ON "user_feedback"("user_id");
CREATE INDEX IF NOT EXISTS "user_feedback_feedback_type_idx" ON "user_feedback"("feedback_type");
CREATE INDEX IF NOT EXISTS "user_feedback_quality_score_idx" ON "user_feedback"("quality_score");
CREATE INDEX IF NOT EXISTS "user_feedback_created_at_idx" ON "user_feedback"("created_at");

-- 用户能力学习表
CREATE TABLE IF NOT EXISTS "user_capability_learning" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL UNIQUE,
    "learned_capability" JSONB NOT NULL, -- { actualMaxAscent, actualRiskTolerance, actualPace }
    "prediction_accuracy" JSONB, -- { ascentPrediction, timePrediction, difficultyPrediction }
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_capability_learning_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_capability_learning_user_id_idx" ON "user_capability_learning"("user_id");
CREATE INDEX IF NOT EXISTS "user_capability_learning_last_updated_idx" ON "user_capability_learning"("last_updated");

-- 路线难度修正表
CREATE TABLE IF NOT EXISTS "route_difficulty_correction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_direction_id" UUID NOT NULL UNIQUE,
    "actual_difficulty" DOUBLE PRECISION, -- 实际难度（基于用户反馈）
    "estimated_difficulty" DOUBLE PRECISION, -- 预估难度
    "correction_factor" DOUBLE PRECISION, -- 修正系数
    "user_count" INTEGER DEFAULT 0, -- 基于多少用户反馈
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_difficulty_correction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "route_difficulty_correction_route_direction_id_idx" ON "route_difficulty_correction"("route_direction_id");
CREATE INDEX IF NOT EXISTS "route_difficulty_correction_user_count_idx" ON "route_difficulty_correction"("user_count");

-- ========== Realtime World State Updates ==========

-- 实时道路状态表
CREATE TABLE IF NOT EXISTS "realtime_road_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "road_id" VARCHAR(100) NOT NULL,
    "current_status" VARCHAR(20) NOT NULL, -- 'OPEN', 'CLOSED', 'CONDITIONAL'
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50) NOT NULL, -- 'official', 'user_report', 'weather_api'
    "confidence" DOUBLE PRECISION DEFAULT 1.0, -- 置信度（0-1）
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_road_status_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "realtime_road_status_road_id_idx" ON "realtime_road_status"("road_id");
CREATE INDEX IF NOT EXISTS "realtime_road_status_last_update_idx" ON "realtime_road_status"("last_update");
CREATE INDEX IF NOT EXISTS "realtime_road_status_source_idx" ON "realtime_road_status"("source");
CREATE UNIQUE INDEX IF NOT EXISTS "realtime_road_status_road_id_unique_idx" ON "realtime_road_status"("road_id");

-- 实时天气预警表
CREATE TABLE IF NOT EXISTS "realtime_weather_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "region" VARCHAR(100) NOT NULL,
    "alert_type" VARCHAR(50) NOT NULL, -- 'WIND', 'SNOW', 'FLOOD', 'VOLCANIC'
    "severity" VARCHAR(20) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "impact_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_weather_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "realtime_weather_alerts_region_idx" ON "realtime_weather_alerts"("region");
CREATE INDEX IF NOT EXISTS "realtime_weather_alerts_time_idx" ON "realtime_weather_alerts"("start_time", "end_time");
CREATE INDEX IF NOT EXISTS "realtime_weather_alerts_severity_idx" ON "realtime_weather_alerts"("severity");

-- 实时POI状态表
CREATE TABLE IF NOT EXISTS "realtime_poi_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poi_id" UUID NOT NULL,
    "current_status" VARCHAR(20) NOT NULL, -- 'OPEN', 'CLOSED', 'CROWDED'
    "wait_time" INTEGER, -- 等待时间（分钟）
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_poi_status_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "realtime_poi_status_poi_id_idx" ON "realtime_poi_status"("poi_id");
CREATE INDEX IF NOT EXISTS "realtime_poi_status_last_update_idx" ON "realtime_poi_status"("last_update");
CREATE UNIQUE INDEX IF NOT EXISTS "realtime_poi_status_poi_id_unique_idx" ON "realtime_poi_status"("poi_id");

-- ========== Predictive World Model ==========

-- 道路状态预测表
CREATE TABLE IF NOT EXISTS "road_status_prediction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "road_id" VARCHAR(100) NOT NULL,
    "prediction_date" DATE NOT NULL,
    "predicted_status" VARCHAR(20) NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL, -- 0-1
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_status_prediction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "road_status_prediction_road_id_idx" ON "road_status_prediction"("road_id");
CREATE INDEX IF NOT EXISTS "road_status_prediction_date_idx" ON "road_status_prediction"("prediction_date");
CREATE INDEX IF NOT EXISTS "road_status_prediction_road_date_idx" ON "road_status_prediction"("road_id", "prediction_date");

-- 天气预测表
CREATE TABLE IF NOT EXISTS "weather_prediction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "region" VARCHAR(100) NOT NULL,
    "prediction_date" DATE NOT NULL,
    "predicted_weather" JSONB NOT NULL, -- { temperature, windSpeed, precipitation, visibility }
    "accessibility_score" DOUBLE PRECISION, -- 0-1
    "risk_factors" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_prediction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "weather_prediction_region_idx" ON "weather_prediction"("region");
CREATE INDEX IF NOT EXISTS "weather_prediction_date_idx" ON "weather_prediction"("prediction_date");
CREATE INDEX IF NOT EXISTS "weather_prediction_region_date_idx" ON "weather_prediction"("region", "prediction_date");

-- 失败风险预测表
CREATE TABLE IF NOT EXISTS "failure_risk_prediction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_direction_id" UUID NOT NULL,
    "trip_id" UUID,
    "prediction_date" DATE NOT NULL,
    "predicted_risks" JSONB NOT NULL, -- [{ day, riskLevel, riskFactors, mitigation }]
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_risk_prediction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "failure_risk_prediction_route_direction_id_idx" ON "failure_risk_prediction"("route_direction_id");
CREATE INDEX IF NOT EXISTS "failure_risk_prediction_trip_id_idx" ON "failure_risk_prediction"("trip_id");
CREATE INDEX IF NOT EXISTS "failure_risk_prediction_date_idx" ON "failure_risk_prediction"("prediction_date");

-- ========== Adaptive World Model ==========

-- 自适应世界模型版本表
CREATE TABLE IF NOT EXISTS "adaptive_world_model_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" VARCHAR(50) NOT NULL UNIQUE, -- 版本号（如 "1.2.3"）
    "parameters" JSONB NOT NULL, -- { routeDifficultyAdjustment, timeEstimateAdjustment, riskAssessmentAdjustment }
    "trained_on" TIMESTAMP(3) NOT NULL,
    "performance" JSONB, -- { predictionAccuracy, userSatisfaction }
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adaptive_world_model_version_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "adaptive_world_model_version_version_idx" ON "adaptive_world_model_version"("version");
CREATE INDEX IF NOT EXISTS "adaptive_world_model_version_trained_on_idx" ON "adaptive_world_model_version"("trained_on");
