-- Phase 2 数据飞轮表 - 手动执行
-- 当 prisma migrate dev 因 shadow DB 问题失败时，可直接执行此脚本
-- 用法: psql $DATABASE_URL -f prisma/migrations/add_flywheel_tables_manual.sql
--
-- 参考: docs/PHASE2_DATA_FLYWHEEL_DESIGN.md

-- Layer 1: 决策记录
CREATE TABLE IF NOT EXISTS "flywheel_decision_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "decision_log_id" UUID,
    "context_snapshot" JSONB NOT NULL,
    "utility_weights" JSONB NOT NULL,
    "candidate_plans" JSONB,
    "selected_plan" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_decision_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "flywheel_decision_logs_user_id_idx" ON "flywheel_decision_logs"("user_id");
CREATE INDEX IF NOT EXISTS "flywheel_decision_logs_trip_id_idx" ON "flywheel_decision_logs"("trip_id");
CREATE INDEX IF NOT EXISTS "flywheel_decision_logs_created_at_idx" ON "flywheel_decision_logs"("created_at" DESC);

-- Layer 2: 用户行为
CREATE TABLE IF NOT EXISTS "flywheel_behavior_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "plan_id" VARCHAR(255),
    "event_type" VARCHAR(50) NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "delta_distance" DOUBLE PRECISION,
    "delta_elevation" DOUBLE PRECISION,
    "delta_time" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_behavior_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "flywheel_behavior_logs_user_id_idx" ON "flywheel_behavior_logs"("user_id");
CREATE INDEX IF NOT EXISTS "flywheel_behavior_logs_trip_id_idx" ON "flywheel_behavior_logs"("trip_id");
CREATE INDEX IF NOT EXISTS "flywheel_behavior_logs_event_type_idx" ON "flywheel_behavior_logs"("event_type");
CREATE INDEX IF NOT EXISTS "flywheel_behavior_logs_created_at_idx" ON "flywheel_behavior_logs"("created_at" DESC);

-- Layer 3: 结果捕捉
CREATE TABLE IF NOT EXISTS "flywheel_outcomes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subjective_feedback" JSONB,
    "objective_execution" JSONB,
    "failure_signals" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_outcomes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "flywheel_outcomes_trip_id_key" UNIQUE ("trip_id")
);

CREATE INDEX IF NOT EXISTS "flywheel_outcomes_user_id_idx" ON "flywheel_outcomes"("user_id");
CREATE INDEX IF NOT EXISTS "flywheel_outcomes_created_at_idx" ON "flywheel_outcomes"("created_at" DESC);

-- Layer 4: 参数版本
CREATE TABLE IF NOT EXISTS "flywheel_parameter_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" VARCHAR(50) NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "scope_id" VARCHAR(255),
    "training_data_range" JSONB NOT NULL,
    "metrics" JSONB,
    "weights" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_parameter_sets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "flywheel_parameter_sets_version_scope_scope_id_key"
    ON "flywheel_parameter_sets"("version", "scope", COALESCE("scope_id", ''));
CREATE INDEX IF NOT EXISTS "flywheel_parameter_sets_scope_scope_id_idx" ON "flywheel_parameter_sets"("scope", "scope_id");
CREATE INDEX IF NOT EXISTS "flywheel_parameter_sets_is_active_idx" ON "flywheel_parameter_sets"("is_active");

-- 用户与参数版本绑定
CREATE TABLE IF NOT EXISTS "flywheel_user_parameter_bindings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "parameter_set_id" UUID NOT NULL,
    "parameter_version" VARCHAR(50) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_user_parameter_bindings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "flywheel_user_parameter_bindings_user_id_key" UNIQUE ("user_id")
);

CREATE INDEX IF NOT EXISTS "flywheel_user_parameter_bindings_parameter_set_id_idx" ON "flywheel_user_parameter_bindings"("parameter_set_id");

-- 记录迁移执行（可选，便于追踪）
DO $$
BEGIN
  RAISE NOTICE 'Phase 2 数据飞轮表已创建: flywheel_decision_logs, flywheel_behavior_logs, flywheel_outcomes, flywheel_parameter_sets, flywheel_user_parameter_bindings';
END $$;
