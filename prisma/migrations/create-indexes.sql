-- 创建 JSONB GIN 索引以加速 JSON 搜索
CREATE INDEX IF NOT EXISTS place_metadata_gin_idx ON "Place" USING GIN (metadata);

-- 创建地理空间索引以加速地理位置查询
CREATE INDEX IF NOT EXISTS place_location_gist_idx ON "Place" USING GIST (location);

-- 创建其他有用的索引
CREATE INDEX IF NOT EXISTS place_category_idx ON "Place" (category);
CREATE INDEX IF NOT EXISTS place_city_id_idx ON "Place" ("cityId");

