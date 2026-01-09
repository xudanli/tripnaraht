-- 为 DocumentIndex 表添加向量索引
-- 用于加速 RAG 检索的向量相似度搜索

-- 确保 pgvector 扩展已安装
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建向量索引（使用 IVFFlat，适合大规模数据）
-- 注意：需要先有一些数据才能创建索引（至少 100 条）
-- 如果数据量较少（< 10万），可以考虑使用 HNSW 索引（见下方注释）

-- IVFFlat 索引（推荐用于大规模数据，占用空间较小）
CREATE INDEX IF NOT EXISTS document_index_embedding_idx 
  ON "document_index" 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- 对于小规模数据（< 10万），可以使用 HNSW（更快但占用更多空间）
-- 如果使用 HNSW，请注释掉上面的 IVFFlat 索引，并取消下面的注释
-- CREATE INDEX IF NOT EXISTS document_index_embedding_hnsw_idx 
--   ON "document_index" 
--   USING hnsw (embedding vector_cosine_ops);

-- 添加注释
COMMENT ON INDEX document_index_embedding_idx IS 
  'DocumentIndex 表的向量索引，用于加速 RAG 检索的语义相似度搜索';

-- 注意：
-- 1. 创建 IVFFlat 索引需要至少 100 条有 embedding 的数据
-- 2. 如果数据量较少，可以先导入一些数据，再创建索引
-- 3. 索引创建后，向量搜索性能会显著提升
-- 4. 如果后续数据量增长到 10万以上，建议重建索引并调整 lists 参数
