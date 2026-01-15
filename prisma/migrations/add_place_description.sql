-- 为 Place 表添加 description（地点介绍）字段
-- 执行时间: 2025-01-15

-- 添加 description 字段（TEXT 类型，可为空）
ALTER TABLE "Place" 
ADD COLUMN IF NOT EXISTS description TEXT;

-- 添加注释
COMMENT ON COLUMN "Place".description IS '地点介绍';
