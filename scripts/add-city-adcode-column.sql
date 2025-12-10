-- 为City表添加adcode字段
ALTER TABLE "City" 
ADD COLUMN IF NOT EXISTS adcode VARCHAR(10);

-- 添加索引以便查询
CREATE INDEX IF NOT EXISTS "City_adcode_idx" ON "City"(adcode);
