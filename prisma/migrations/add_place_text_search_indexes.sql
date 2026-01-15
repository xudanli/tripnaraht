-- 为 Place 表添加文本搜索索引以优化管理接口查询性能
-- 这些索引可以加速 nameCN, nameEN, address 的 ILIKE 查询

-- 为 nameCN 创建索引（支持大小写不敏感搜索）
CREATE INDEX IF NOT EXISTS place_namecn_idx ON "Place" (LOWER("nameCN"));

-- 为 nameEN 创建索引（支持大小写不敏感搜索）
CREATE INDEX IF NOT EXISTS place_nameen_idx ON "Place" (LOWER("nameEN"));

-- 为 address 创建索引（支持大小写不敏感搜索）
CREATE INDEX IF NOT EXISTS place_address_idx ON "Place" (LOWER(address));

-- 复合索引：category + cityId（常用于筛选）
CREATE INDEX IF NOT EXISTS place_category_cityid_idx ON "Place" (category, "cityId");

-- 复合索引：category + createdAt（用于排序）
CREATE INDEX IF NOT EXISTS place_category_createdat_idx ON "Place" (category, "createdAt" DESC);
