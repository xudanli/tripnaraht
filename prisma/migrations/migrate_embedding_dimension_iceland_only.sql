-- 迁移冰岛（IS）的 embedding 维度：1536 → 1024
-- 只处理冰岛数据，其他国家的数据保持不变
--
-- 注意：
-- 1. 此迁移只影响冰岛的 Place 记录
-- 2. 需要先确保冰岛的 embedding 列可以存储 1024 维向量
-- 3. 如果列定义是 vector(1536)，需要先修改列定义（允许可变维度）

-- 方案：使用临时列迁移冰岛数据
-- 步骤1: 添加临时列（1024维）
ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS embedding_new vector(1024);

-- 步骤2: 将冰岛数据的 embedding 复制到新列（如果有数据的话）
-- 注意：这里只是准备，实际数据迁移由脚本完成

-- 步骤3: 迁移完成后，删除旧列，重命名新列
-- DROP INDEX IF EXISTS place_embedding_idx;
-- ALTER TABLE "Place" DROP COLUMN IF EXISTS embedding;
-- ALTER TABLE "Place" RENAME COLUMN embedding_new TO embedding;
-- CREATE INDEX place_embedding_idx ON "Place" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 或者更简单的方案：直接修改列定义为可变维度（如果 PostgreSQL 支持）
-- 但 pgvector 不支持可变维度，所以需要上述方案
