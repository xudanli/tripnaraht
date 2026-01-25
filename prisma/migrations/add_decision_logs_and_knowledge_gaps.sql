-- Migration: Add decision_logs and knowledge_gaps tables
-- Date: 2026-01-24
-- Description: 添加 Gate 决策日志表和知识缺口记录表，支持 TripNARA 决策优先架构

-- ========================================
-- 1. decision_logs 表 - Gate 决策日志
-- ========================================

CREATE TABLE IF NOT EXISTS "decision_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" TEXT NOT NULL,
  "step" TEXT NOT NULL, -- INTAKE, RESEARCH, GATE_EVAL, PLAN_GEN, VERIFY, REPAIR, NARRATE, DONE, FAILED
  "actor" TEXT NOT NULL, -- Orchestrator, Planner, Gatekeeper, Compliance, LocalInsight, CoreDecision, Narrator
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
  "inputs_summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "outputs_summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "evidence_refs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "retrieval_trace" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引优化
CREATE INDEX IF NOT EXISTS "idx_decision_logs_request_id" ON "decision_logs"("request_id");
CREATE INDEX IF NOT EXISTS "idx_decision_logs_step" ON "decision_logs"("step");
CREATE INDEX IF NOT EXISTS "idx_decision_logs_actor" ON "decision_logs"("actor");
CREATE INDEX IF NOT EXISTS "idx_decision_logs_timestamp" ON "decision_logs"("timestamp" DESC);

-- GIN 索引用于 JSON 查询（gate_result 查询）
CREATE INDEX IF NOT EXISTS "idx_decision_logs_gate_result"
  ON "decision_logs" USING GIN ((outputs_summary->'gate_result'));

-- GIN 索引用于 evidence_refs 查询
CREATE INDEX IF NOT EXISTS "idx_decision_logs_evidence"
  ON "decision_logs" USING GIN (evidence_refs);

-- 注释
COMMENT ON TABLE "decision_logs" IS 'Should-Exist Gate 决策日志，记录完整决策过程';
COMMENT ON COLUMN "decision_logs"."request_id" IS '请求唯一标识';
COMMENT ON COLUMN "decision_logs"."step" IS '工作流步骤: INTAKE, RESEARCH, GATE_EVAL, PLAN_GEN, VERIFY, REPAIR, NARRATE';
COMMENT ON COLUMN "decision_logs"."actor" IS '执行角色: Orchestrator, Planner, Gatekeeper, Compliance, LocalInsight, CoreDecision, Narrator';
COMMENT ON COLUMN "decision_logs"."evidence_refs" IS '证据引用列表 (RAG chunks + Tool 调用)';
COMMENT ON COLUMN "decision_logs"."retrieval_trace" IS 'RAG 检索和 Tool 调用详细追踪';

-- ========================================
-- 2. knowledge_gaps 表 - 知识缺口记录
-- ========================================

CREATE TABLE IF NOT EXISTS "knowledge_gaps" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "query" TEXT NOT NULL,
  "category" TEXT NOT NULL, -- RULES, GATE, POI, SPATIAL, GENERAL
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
  "attempted_methods" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "source" TEXT,
  "needs_index" BOOLEAN NOT NULL DEFAULT true,
  "indexed_at" TIMESTAMP WITH TIME ZONE,
  "notes" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引优化
CREATE INDEX IF NOT EXISTS "idx_knowledge_gaps_category" ON "knowledge_gaps"("category");
CREATE INDEX IF NOT EXISTS "idx_knowledge_gaps_timestamp" ON "knowledge_gaps"("timestamp" DESC);

-- 部分索引：只索引未处理的记录（性能优化）
CREATE INDEX IF NOT EXISTS "idx_knowledge_gaps_needs_index"
  ON "knowledge_gaps"("needs_index")
  WHERE "needs_index" = true;

-- 注释
COMMENT ON TABLE "knowledge_gaps" IS '知识缺口记录，用于持续改进知识库';
COMMENT ON COLUMN "knowledge_gaps"."query" IS '导致降级的查询';
COMMENT ON COLUMN "knowledge_gaps"."category" IS '查询类别: RULES, GATE, POI, SPATIAL, GENERAL';
COMMENT ON COLUMN "knowledge_gaps"."attempted_methods" IS '尝试过的检索方法 (JSON 数组)';
COMMENT ON COLUMN "knowledge_gaps"."needs_index" IS '是否需要索引到知识库';
COMMENT ON COLUMN "knowledge_gaps"."indexed_at" IS '索引完成时间';

-- ========================================
-- 3. 扩展 chunks 表 - 添加新鲜度字段
-- ========================================

-- 添加新字段
ALTER TABLE "chunks"
ADD COLUMN IF NOT EXISTS "last_verified_at" TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS "category" TEXT;

-- 更新现有数据（根据文件名推断类别）
UPDATE "chunks" c
SET category = CASE
  WHEN EXISTS (
    SELECT 1 FROM "knowledge_files" kf
    WHERE kf.id = c.file_id
      AND (kf.filename ILIKE '%rule%' OR kf.filename ILIKE '%law%')
  ) THEN 'RULES'
  WHEN EXISTS (
    SELECT 1 FROM "knowledge_files" kf
    WHERE kf.id = c.file_id
      AND (kf.filename ILIKE '%poi%' OR kf.filename ILIKE '%attraction%')
  ) THEN 'POI_INFO'
  WHEN EXISTS (
    SELECT 1 FROM "knowledge_files" kf
    WHERE kf.id = c.file_id
      AND kf.filename ILIKE '%weather%'
  ) THEN 'WEATHER'
  WHEN EXISTS (
    SELECT 1 FROM "knowledge_files" kf
    WHERE kf.id = c.file_id
      AND (kf.filename ILIKE '%gate%' OR kf.filename ILIKE '%risk%')
  ) THEN 'GATE'
  ELSE 'GENERAL'
END
WHERE category IS NULL;

-- 初始化 last_verified_at 为创建时间
UPDATE "chunks"
SET last_verified_at = created_at
WHERE last_verified_at IS NULL;

-- 索引优化
CREATE INDEX IF NOT EXISTS "idx_chunks_category" ON "chunks"("category");
CREATE INDEX IF NOT EXISTS "idx_chunks_last_verified" ON "chunks"("last_verified_at");

-- 组合索引：按类别查询过期数据
CREATE INDEX IF NOT EXISTS "idx_chunks_category_last_verified"
  ON "chunks"("category", "last_verified_at" DESC);

-- 注释
COMMENT ON COLUMN "chunks"."last_verified_at" IS '最后验证时间（用于新鲜度检查）';
COMMENT ON COLUMN "chunks"."category" IS '数据类别: RULES, POI_HOURS, POI_INFO, GATE, WEATHER, GENERAL';

-- ========================================
-- 4. 创建统计视图（可选 - 方便查询）
-- ========================================

-- Gate 决策统计视图
CREATE OR REPLACE VIEW "v_gate_decision_stats" AS
SELECT
  DATE_TRUNC('day', timestamp) AS date,
  outputs_summary->>'gate_result' AS gate_result,
  COUNT(*) AS count,
  AVG((outputs_summary->>'confidence')::float) AS avg_confidence,
  AVG(jsonb_array_length(evidence_refs)) AS avg_evidence_count
FROM decision_logs
WHERE step = 'GATE_EVAL'
  AND outputs_summary->>'gate_result' IS NOT NULL
GROUP BY DATE_TRUNC('day', timestamp), outputs_summary->>'gate_result'
ORDER BY date DESC, gate_result;

COMMENT ON VIEW "v_gate_decision_stats" IS 'Gate 决策统计视图（按日汇总）';

-- 知识缺口统计视图
CREATE OR REPLACE VIEW "v_knowledge_gap_stats" AS
SELECT
  category,
  needs_index,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE indexed_at IS NOT NULL) AS indexed_count,
  MAX(timestamp) AS last_gap_at
FROM knowledge_gaps
GROUP BY category, needs_index
ORDER BY category, needs_index DESC;

COMMENT ON VIEW "v_knowledge_gap_stats" IS '知识缺口统计视图（按类别汇总）';

-- 数据新鲜度统计视图
CREATE OR REPLACE VIEW "v_chunks_freshness_stats" AS
SELECT
  category,
  COUNT(*) AS total_chunks,
  COUNT(*) FILTER (WHERE last_verified_at > NOW() - INTERVAL '7 days') AS fresh_7d,
  COUNT(*) FILTER (WHERE last_verified_at > NOW() - INTERVAL '30 days') AS fresh_30d,
  COUNT(*) FILTER (WHERE last_verified_at > NOW() - INTERVAL '90 days') AS fresh_90d,
  COUNT(*) FILTER (WHERE last_verified_at <= NOW() - INTERVAL '90 days') AS stale_90d,
  MAX(last_verified_at) AS last_verified,
  MIN(last_verified_at) AS oldest_verified
FROM chunks
WHERE category IS NOT NULL
GROUP BY category
ORDER BY category;

COMMENT ON VIEW "v_chunks_freshness_stats" IS 'Chunks 新鲜度统计视图（按类别汇总）';

-- ========================================
-- 5. 数据完整性检查
-- ========================================

-- 验证索引创建成功
DO $$
BEGIN
  RAISE NOTICE '=== 迁移完成检查 ===';

  -- 检查表是否存在
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'decision_logs') THEN
    RAISE NOTICE '✓ decision_logs 表创建成功';
  ELSE
    RAISE WARNING '✗ decision_logs 表创建失败';
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'knowledge_gaps') THEN
    RAISE NOTICE '✓ knowledge_gaps 表创建成功';
  ELSE
    RAISE WARNING '✗ knowledge_gaps 表创建失败';
  END IF;

  -- 检查 chunks 表字段
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_name = 'chunks' AND column_name = 'category'
  ) THEN
    RAISE NOTICE '✓ chunks.category 字段添加成功';
  ELSE
    RAISE WARNING '✗ chunks.category 字段添加失败';
  END IF;

  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_name = 'chunks' AND column_name = 'last_verified_at'
  ) THEN
    RAISE NOTICE '✓ chunks.last_verified_at 字段添加成功';
  ELSE
    RAISE WARNING '✗ chunks.last_verified_at 字段添加失败';
  END IF;

  -- 检查视图
  IF EXISTS (SELECT FROM pg_views WHERE viewname = 'v_gate_decision_stats') THEN
    RAISE NOTICE '✓ v_gate_decision_stats 视图创建成功';
  END IF;

  IF EXISTS (SELECT FROM pg_views WHERE viewname = 'v_knowledge_gap_stats') THEN
    RAISE NOTICE '✓ v_knowledge_gap_stats 视图创建成功';
  END IF;

  IF EXISTS (SELECT FROM pg_views WHERE viewname = 'v_chunks_freshness_stats') THEN
    RAISE NOTICE '✓ v_chunks_freshness_stats 视图创建成功';
  END IF;

  RAISE NOTICE '=== 迁移检查完成 ===';
END $$;

-- ========================================
-- 执行说明
-- ========================================

-- 1. 在 PostgreSQL 中执行本 SQL 文件:
--    psql -U your_user -d tripnara_db -f prisma/migrations/add_decision_logs_and_knowledge_gaps.sql

-- 2. 更新 Prisma Schema (prisma/schema.prisma) 添加模型定义

-- 3. 重新生成 Prisma Client:
--    npx prisma generate

-- 4. 验证迁移成功:
--    SELECT * FROM v_gate_decision_stats LIMIT 5;
--    SELECT * FROM v_knowledge_gap_stats;
--    SELECT * FROM v_chunks_freshness_stats;
