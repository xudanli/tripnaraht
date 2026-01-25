-- 添加知识库管理表结构
-- 执行时间: 2026-01-23

-- 1. 启用 pgvector 扩展（如果尚未启用）
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 创建知识库文件表
CREATE TABLE IF NOT EXISTS knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) UNIQUE NOT NULL,
  filepath VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL,
  language VARCHAR(10) DEFAULT 'zh-CN',
  credibility_score FLOAT NOT NULL,
  data_sources TEXT[] DEFAULT '{}',
  last_updated TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_files_category ON knowledge_files(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_filename ON knowledge_files(filename);

-- 3. 创建文档分块表
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id VARCHAR(255) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  type VARCHAR(50) NOT NULL,
  section VARCHAR(100),
  credibility_score FLOAT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  file_id UUID NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
  metadata JSONB,
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(type);
CREATE INDEX IF NOT EXISTS idx_chunks_credibility_score ON chunks(credibility_score);
CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);

-- 4. 创建向量索引（使用 HNSW，性能更好）
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 5. 创建关键词索引表
CREATE TABLE IF NOT EXISTS keyword_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(100) UNIQUE NOT NULL,
  files TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. 创建查询历史表
CREATE TABLE IF NOT EXISTS query_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  retrieved_chunks JSONB NOT NULL,
  answer TEXT,
  avg_credibility FLOAT,
  execution_time_ms INTEGER NOT NULL,
  user_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_history_created_at ON query_history(created_at);

-- 7. 删除旧的 DocumentIndex 表数据（可选，根据用户需求）
-- TRUNCATE TABLE document_index;

-- 注意：DocumentIndex 表保留用于向后兼容，但新数据应使用 Chunk 表
