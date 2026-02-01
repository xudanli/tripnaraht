-- CreateTable: trip_readiness_decision
-- 用户准备度决策记录表
-- 用于存储用户对准备度规则问题的回答和决策结果

CREATE TABLE IF NOT EXISTS "trip_readiness_decision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "pack_id" TEXT,
    "user_id" UUID,
    "answers" JSONB NOT NULL,
    "decision_result" JSONB NOT NULL,
    "matched_branch_id" TEXT,
    "block_trip" BOOLEAN NOT NULL DEFAULT false,
    "updated_action" JSONB,
    "category" TEXT,
    "severity" TEXT,
    "level" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_readiness_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: trip_readiness_decision_trip_id_idx
CREATE INDEX IF NOT EXISTS "trip_readiness_decision_trip_id_idx" ON "trip_readiness_decision"("trip_id");

-- CreateIndex: trip_readiness_decision_rule_id_idx
CREATE INDEX IF NOT EXISTS "trip_readiness_decision_rule_id_idx" ON "trip_readiness_decision"("rule_id");

-- CreateIndex: trip_readiness_decision_pack_id_idx
CREATE INDEX IF NOT EXISTS "trip_readiness_decision_pack_id_idx" ON "trip_readiness_decision"("pack_id");

-- CreateIndex: trip_readiness_decision_user_id_idx
CREATE INDEX IF NOT EXISTS "trip_readiness_decision_user_id_idx" ON "trip_readiness_decision"("user_id");

-- CreateIndex: trip_readiness_decision_trip_id_rule_id_idx (unique constraint for one decision per trip-rule pair)
CREATE UNIQUE INDEX IF NOT EXISTS "trip_readiness_decision_trip_id_rule_id_key" ON "trip_readiness_decision"("trip_id", "rule_id");

-- CreateIndex: trip_readiness_decision_created_at_idx
CREATE INDEX IF NOT EXISTS "trip_readiness_decision_created_at_idx" ON "trip_readiness_decision"("created_at");

-- Add comment
COMMENT ON TABLE "trip_readiness_decision" IS '用户准备度决策记录表，存储用户对准备度规则问题的回答和决策结果';
