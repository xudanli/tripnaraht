-- 添加 pgvector 扩展（如果尚未安装）
CREATE EXTENSION IF NOT EXISTS vector;

-- 在 Place 表中添加 embedding 字段
ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 创建向量索引（使用 IVFFlat，适合大规模数据）
-- 注意：需要先有一些数据才能创建索引（至少 100 条）
CREATE INDEX IF NOT EXISTS place_embedding_idx ON "Place" 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- 对于小规模数据（< 10万），可以使用 HNSW（更快但占用更多空间）
-- CREATE INDEX IF NOT EXISTS place_embedding_hnsw_idx ON "Place" 
--   USING hnsw (embedding vector_cosine_ops);

-- 添加注释
COMMENT ON COLUMN "Place".embedding IS '地点文本的向量表示，用于语义搜索';

