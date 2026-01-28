-- 迁移 embedding 维度：1536 → 1024
-- 从 OpenAI text-embedding-3-small (1536维) 迁移到 BGE-M3 (1024维)
--
-- 注意：
-- 1. 此迁移会删除所有现有的 embedding 数据
-- 2. 迁移后需要重新生成所有 embedding（使用 BGE-M3）
-- 3. 建议在低峰期执行
--
-- 执行步骤：
-- 1. 备份数据库
-- 2. 运行此迁移脚本
-- 3. 运行 npm run script:migrate-embeddings 重新生成 embedding

-- 步骤1: 删除旧的向量索引
DROP INDEX IF EXISTS place_embedding_idx;
DROP INDEX IF EXISTS place_embedding_hnsw_idx;

-- 步骤2: 删除旧的 embedding 列（会删除所有数据）
ALTER TABLE "Place" DROP COLUMN IF EXISTS embedding;

-- 步骤3: 添加新的 embedding 列（1024维）
ALTER TABLE "Place" ADD COLUMN embedding vector(1024);

-- 步骤4: 创建新的向量索引（使用 IVFFlat，适合大规模数据）
-- 注意：需要先有一些数据才能创建索引（至少 100 条）
-- 如果数据量 < 10万，可以考虑使用 HNSW（更快但占用更多空间）
CREATE INDEX IF NOT EXISTS place_embedding_idx ON "Place" 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- 对于小规模数据（< 10万），可以使用 HNSW（更快但占用更多空间）
-- CREATE INDEX IF NOT EXISTS place_embedding_hnsw_idx ON "Place" 
--   USING hnsw (embedding vector_cosine_ops);

-- 添加注释
COMMENT ON COLUMN "Place".embedding IS '地点文本的向量表示（BGE-M3，1024维），用于语义搜索';
